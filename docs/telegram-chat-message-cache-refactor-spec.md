# Telegram Chat Message Cache Refactor Spec

## Status

- **Owner:** M Jones
- **Draft owner:** Finn
- **Date:** 2026-05-19
- **Status:** Draft for M Jones approval
- **Scope:** Mission Control Telegram Chat Inbox UI state/caching refactor for the standalone page and widget surfaces
- **Related source:** `docs/telegram-chat-inbox-prd-implementation-plan.md`

## Change log

### 2026-05-19 update

- Added the approved incremental polling direction: `after=<messageId>` maps to GramJS `minId` with `reverse: true` for oldest-to-newest newer-message fetches.
- Added per-chat `latestAcknowledgedOutgoingMessageId` tracking as the preferred normal polling lower-bound cursor.
- Clarified fallback to latest cached/loaded message id before any acknowledged outgoing cursor exists.
- Reframed latest-window reconciliation as a low-priority/background metadata-drift fallback rather than the core polling path.

## Background / current behavior

Mission Control has two Telegram chat UI surfaces with substantially duplicated client-side data flow:

- `src/components/chat/TelegramChatInboxPage.tsx`
- `src/components/chat/TelegramChatWidgetContent.tsx`

Both surfaces currently maintain one global `messages` array for whichever chat is selected. Selecting a different chat clears that array, resets `hasOlderMessages`, and waits for a fresh message fetch before showing the thread. Returning from Chat A → Chat B → Chat A therefore often blanks the thread even if Chat A was loaded moments earlier.

Current behavior and constraints observed in the code:

- Chat summaries are kept in mounted React component state and refreshed by polling `/api/telegram/chats?limit=100` every 15 seconds while the document is visible.
- Last opened chat id is persisted in `localStorage` at `mission-control.telegram.lastChatId`.
- Message fetches use `GET /api/telegram/chats/:chatId/messages?limit=25`, with optional `before=<oldestMessageId>` for older batches.
- Both UI surfaces use one global `loadingMessagesRef`; while one chat's messages are in flight, another chat's initial load can be skipped.
- Stale responses are partially guarded by checking that the selected chat still matches the response chat before applying messages.
- Background refresh failures can clear messages for non-background loads and can surface errors globally.
- Older loaded messages are prepended only to the current global `messages` array and are lost on chat switch.
- Sends split long text via `splitTelegramMessageText`, post each chunk sequentially, append each returned message to the global `messages` array, and leave unsent chunks in the composer after partial failure.
- Both surfaces call `PATCH /api/telegram/chats/:chatId/messages` after message load to mark the selected chat read.
- `src/lib/telegram/chats.ts` already auto-clears unread bridge/status messages matching known OpenClaw bridge patterns while listing chats.

The broad Telegram Chat Inbox PRD identifies a small bounded cache as desirable, but does not define the shared hook/cache refactor deeply enough for implementation.

## Problem statement

The current state model makes the Telegram chat UI feel unlike a normal chat app because recently opened conversations are not retained in the UI. It also creates correctness risks: a global message loading guard can block the selected chat, older loaded history is not retained per chat, duplicated page/widget logic can drift, and polling can yank scroll position while the user is reading older messages.

## Goals

1. Create a shared client-side data hook for both the standalone page and widget so data/fetch/cache/send/read behavior is implemented once.
2. Cache messages per chat in memory for the current mounted surface/session.
3. Make Chat A → Chat B → Chat A render cached Chat A messages immediately when available.
4. Keep older manually loaded messages in the per-chat cache during the session.
5. Keep background refreshes non-destructive: stale cached messages remain visible on refresh failure.
6. Use per-chat in-flight/loading guards so one chat request does not block another chat.
7. Preserve current Telegram API contracts and server-side source-of-truth behavior.
8. Keep visual layout/JSX separate enough that the page and widget can retain distinct responsive layouts.
9. Define testable acceptance criteria before implementation.

## Non-goals

- No server-side message cache or durable local mirror of Telegram history.
- No database schema changes.
- No broad Telegram MTProto/API contract changes beyond the bounded `after` newer-message polling parameter defined in this spec.
- No broad visual redesign beyond wiring existing layouts to shared state.
- No automatic older-message loading on scroll in V1.
- No media/file caching.
- No persistence of message bodies in `localStorage`.
- No replacement of existing `LinkifiedText` behavior.

## User-visible behavior requirements

### Chat switching and cached display

- When M Jones opens Chat A, waits for messages, opens Chat B, then returns to Chat A, Chat A's cached messages must render immediately if available.
- If cached messages exist, the UI may show a subtle refreshing state, but must not replace the thread with a blocking loader.
- If no cached messages exist for a selected chat, the existing loading state is acceptable while the initial fetch runs.
- Switching chats must not clear cached messages for the previous chat.
- Switching away from a chat must clear UI-local reply/composer state only where current behavior already does so; it must not clear that chat's cached messages.

### Older messages

- Older messages are loaded only when M Jones clicks the existing “Load older messages” / “Load older” button.
- The refactor must not introduce automatic load older on scroll.
- Older loaded messages must persist in that chat's cache while the surface remains mounted.
- Returning to a chat with older history already loaded must show the older messages without requiring another older fetch.
- `hasOlderMessages` must be tracked per chat.

### Scroll behavior

- Initial uncached load should scroll to the bottom after messages render.
- Returning to a cached chat should preserve the user's last known scroll position when practical.
- Background refresh/polling must not yank the thread to the bottom while M Jones is reading older messages.
- Sending a message must not force-scroll the thread to the bottom when M Jones is currently scrolled up reading older messages.
- If M Jones is already near the bottom, new messages from refresh/send should keep the thread at the bottom.
- If M Jones is not near the bottom, incoming or sent messages should append to the cache/thread without yanking the visible scroll position.
- This no-yank send behavior applies to both the full `/chat-inbox` page and the floating widget, including long-message chunk sends and partial sends.
- The hook may expose scroll intent metadata, but DOM refs and exact scroll restoration should remain UI-local to the page/widget components.

### Polling / background refresh

- Chat list polling remains approximately every 15 seconds while `document.hidden === false`.
- Selected chat polling remains approximately every 10 seconds while `document.hidden === false`.
- Message polling should update the selected chat's cache only; it must not clear the selected thread before refresh completes.
- Normal selected-chat polling should fetch only messages newer than the chosen lower-bound cursor instead of refetching the latest 25 messages every 10 seconds.
- When available, the preferred lower-bound cursor is that chat's latest acknowledged outgoing M Jones message id, tracked as `latestAcknowledgedOutgoingMessageId`.
- If no acknowledged outgoing cursor exists yet, polling should fall back to the latest cached/loaded message id for that chat.
- When the document is hidden, polling should pause as it does today.
- On visibility return, the next interval or an explicit visibility handler may refresh; V1 does not require immediate catch-up if not already present.

### Send/reply behavior and long-message chunking

- Sending still uses `splitTelegramMessageText` and respects `TELEGRAM_TEXT_MESSAGE_LIMIT`.
- Each chunk is posted sequentially to `POST /api/telegram/chats/:chatId/messages`.
- Only the first chunk carries `replyToMessageId`; follow-up chunks are normal messages.
- Each successfully sent returned message is appended to the selected chat's cache, not to a global messages array.
- Appending sent messages must respect current scroll position: follow the latest messages only when the user is near bottom; otherwise append without changing the visible scroll position.
- After all chunks succeed, composer text and reply target are cleared and chat summaries are refreshed.
- If a later chunk fails after earlier chunks succeeded:
  - successfully sent chunks remain appended in the chat cache,
  - the composer is restored to unsent chunks only,
  - the error is shown,
  - chat summaries refresh if any chunk was sent.
- If the selected chat changes while a send is in flight, returned sent messages must append to the chat they were sent to, not whichever chat is currently selected.

### Read/unread and bridge/status auto-read behavior

- Opening/loading a selected chat should continue to mark it read using `PATCH /api/telegram/chats/:chatId/messages` with the latest loaded message id when available.
- The chat list should optimistically show `unreadCount: 0` for the selected chat as it does today.
- Mark-read failures remain best-effort and should not clear messages or block the UI.
- Existing bridge/status auto-read behavior in `src/lib/telegram/chats.ts` must remain unchanged. This refactor should not broaden auto-read patterns.
- Background message refresh for the selected chat may mark read if it reflects the currently open chat. Non-selected chats must not be marked read by message-cache refreshes.

## Technical design

### Shared hook

Create a shared client hook:

```ts
src/components/chat/useTelegramChatInbox.ts
```

Recommended exported API:

```ts
export interface TelegramChat {
  id: string;
  title: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface TelegramMessage {
  id: number;
  chatId: string;
  text: string;
  senderId: string | null;
  senderName: string | null;
  isOutgoing: boolean;
  reactionCount: number;
  sentAt: string;
  replyToMessageId: number | null;
  editedAt: string | null;
}

export interface ChatMessageCacheEntry {
  messages: TelegramMessage[];
  hasOlderMessages: boolean;
  latestAcknowledgedOutgoingMessageId: number | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingOlder: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  lastAccessedAt: number;
  scrollTop?: number;
}
```

`latestAcknowledgedOutgoingMessageId` is per chat and must be monotonic non-decreasing. It records the newest outgoing M Jones message id that counts as acknowledged for polling-cursor purposes.

The hook should expose enough state/actions for both existing surfaces without exposing internal refs:

```ts
export interface UseTelegramChatInboxResult {
  chats: TelegramChat[];
  selectedChat: TelegramChat | null;
  selectedChatId: string | null;
  selectedChatTitle: string;
  selectedMessages: TelegramMessage[];
  selectedCacheEntry: ChatMessageCacheEntry | null;
  loadingChats: boolean;
  loadingMessages: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  sending: boolean;
  error: string | null;
  selectChat(chat: TelegramChat): void;
  clearSelection(): void;
  loadOlderMessages(): Promise<void>;
  sendMessage(text: string, replyTo?: TelegramMessage | null): Promise<SendMessageResult>;
  setChatScrollTop(chatId: string, scrollTop: number): void;
  refreshChats(options?: { background?: boolean }): Promise<void>;
  refreshSelectedMessages(options?: { background?: boolean }): Promise<void>;
}
```

`SendMessageResult` should at minimum communicate whether the caller should clear composer/reply state and what unsent text remains after partial failure:

```ts
export type SendMessageResult =
  | { ok: true }
  | { ok: false; unsentText: string; sentAnyChunks: boolean; error: string };
```

The components remain responsible for:

- JSX/layout differences between standalone page and widget.
- Composer text state.
- Reply target state.
- `scrollRef`, `isNearBottomRef`, and actual DOM scroll changes.
- Choosing labels/copy for button text in each surface.

The hook owns:

- Chat list state and polling.
- Selected chat state and last-opened chat persistence.
- Per-chat message cache state.
- Fetch/send/mark-read request lifecycle.
- Per-chat in-flight guards.
- Cache cap/eviction.
- Error state surfaced to the UI.

### Cache shape and cap policy

Use an in-memory cache keyed by `chatId`:

```ts
type MessageCacheByChatId = Record<string, ChatMessageCacheEntry>;
```

Recommended V1 policy:

- Cache only chats opened in the current mounted surface/session.
- Cache at most 20 chats.
- Cache at most 150 messages per chat.
- Evict least-recently-accessed chats when exceeding 20 entries.
- When trimming messages within a chat, prefer retaining the newest 150 messages. This means very deep older history may be dropped if the cap is exceeded.
- If trimming drops older messages, `hasOlderMessages` should remain `true` unless the API explicitly indicated there are no older messages.
- Do not persist message bodies to `localStorage`.
- Do not use `sessionStorage` in V1 unless M Jones explicitly approves expanding scope.

Rationale: this satisfies the responsiveness request without creating a durable hidden archive of sensitive Telegram message text.

### Per-chat loading and in-flight guards

Replace the global message loading guard with refs keyed by chat id, for example:

```ts
const inFlightByChatIdRef = useRef<Record<string, {
  initialOrRefresh?: AbortController;
  older?: AbortController;
  requestSeq: number;
}>>({});
```

Minimum required behavior:

- A refresh for Chat A must not block an initial load for Chat B.
- A second refresh for the same chat may be skipped or supersede the previous one, but behavior must be deterministic.
- Older-message load for a chat must be guarded independently from newest refresh.
- Send requests should be guarded by a single `sending` flag for the selected surface unless implementation needs per-chat sends; do not allow double-submit from repeated Enter/click.

### Selected chat state and last-opened chat persistence

- The hook should store `selectedChatId` as the source of truth.
- `selectedChat` should be derived from `chats.find(chat => chat.id === selectedChatId)` where possible, with a fallback title/id if the chat list is temporarily stale.
- On initial chat list load, choose `localStorage.getItem('mission-control.telegram.lastChatId')` if present in the loaded chat list; otherwise choose the first loaded chat.
- On `selectChat(chat)`, persist the id to `localStorage` using the existing key.
- On widget `clearSelection`/back in non-expanded mode, clearing visual selection is acceptable, but it must not delete cached messages.

### Request lifecycle and stale response handling

For each message request:

- Capture `chatId`, request type, and a monotonically increasing sequence number.
- Apply response data only to that request's chat cache entry.
- Never apply response data to a different currently selected chat.
- A response for a no-longer-selected chat may still update that chat's cache if the request was valid for that chat and not superseded.
- Superseded older refresh responses should be ignored if a newer request for the same chat has already completed.
- Abort or ignore in-flight requests on unmount to avoid React state updates after unmount.
- Timeouts should remain approximately `REQUEST_TIMEOUT_MS = 12000` for chat/message fetch/send requests.

### Message API contract and incremental polling

Keep the current older-pagination contract and add a bounded newer-message polling parameter:

- `GET /api/telegram/chats/:chatId/messages?limit=25` remains the initial/latest batch path.
- `GET /api/telegram/chats/:chatId/messages?limit=25&before=<messageId>` remains older pagination.
- `GET /api/telegram/chats/:chatId/messages?limit=25&after=<messageId>` fetches messages newer than `after`.
- For V1, reject requests that supply both `before` and `after` with `400` rather than defining range semantics.
- Keep `limit` at `MESSAGE_BATCH_SIZE = 25` unless explicitly overridden by the request.

The route should parse `after` like `before`: reject missing/invalid/non-integer/negative values, pass the parsed id to the Telegram library layer, and preserve existing `before` behavior.

The Telegram library layer should support an options object equivalent to:

```ts
export async function listTelegramGroupChatMessages(
  chatId: string,
  limit = MESSAGE_BATCH_SIZE,
  options?: { beforeMessageId?: number; afterMessageId?: number },
): Promise<TelegramTextMessage[]> {
  if (options?.beforeMessageId && options?.afterMessageId) {
    throw new Error('before and after cannot be combined in V1');
  }

  const messages = options?.afterMessageId
    ? await client.getMessages(dialog.inputEntity, {
        limit,
        minId: options.afterMessageId,
        reverse: true,
      })
    : await client.getMessages(dialog.inputEntity, {
        limit,
        offsetId: options?.beforeMessageId || 0,
      });

  // The after/minId branch with reverse: true is already oldest -> newest.
  // Only reverse the existing newest-first branch before returning.
}
```

`minId` is the newer-than lower bound: results must have ids strictly greater than `afterMessageId`. `reverse: true` makes GramJS return those results oldest → newest, matching the UI cache order without a second reverse.

### Acknowledged-outgoing cursor semantics

For V1, the selected-chat polling cursor should use the latest acknowledged outgoing message as the preferred lower bound when available:

- Track `latestAcknowledgedOutgoingMessageId` per chat in the message cache entry.
- A message counts as acknowledged for this cursor when it is an outgoing M Jones message and `reactionCount > 0`.
- If later implementation has reliable known-agent identity filtering, this can be narrowed to reactions from known agent ids; V1 does not require that filter.
- The cursor must be monotonic non-decreasing per chat: never lower `latestAcknowledgedOutgoingMessageId` when merging older, stale, or refreshed data.
- Normal incremental polling should request `after=<latestAcknowledgedOutgoingMessageId>` when that cursor exists.
- If no acknowledged outgoing cursor exists, fall back to the latest cached/loaded message id for that chat.
- This relies on the practical ordering assumption that an acknowledged outgoing M Jones message means prior relevant messages have been processed/seen. M Jones accepts that assumption for V1.

When incremental polling returns new messages, merge them into that chat's cache by id and keep the per-chat `messages` array sorted chronologically oldest → newest.

### Low-priority latest-window reconciliation

Incremental polling by `after` is the main selected-chat polling design. It will not catch metadata drift on already-cached messages, such as reaction changes, edits, or deletes at ids at or below the cursor.

For V1, latest-window reconciliation is only a low-priority/background fallback, not a core polling path or acceptance blocker. If implemented, run it on a coarse cadence such as every ~5 minutes, on manual refresh, or on visibility return, and merge/upsert recent messages without clearing the visible cache.

### Background refresh failure handling

- If a background refresh fails and cached messages exist, keep cached messages visible.
- Surface a non-blocking error such as “Couldn’t refresh Telegram messages.”
- Do not set the selected chat's messages to `[]` on background refresh failure.
- If an uncached initial load fails, show the existing error/empty state and set the selected cache entry error.
- Errors should be scoped where practical, but a single displayed error banner is acceptable for V1 if it does not clear cached content.

### Message merge behavior

#### Initial/latest refresh and incremental newer polling

- Initial/latest API loads return messages ordered oldest → newest after the existing newest-first branch is reversed.
- `after`/`minId` API loads with `reverse: true` already return messages oldest → newest and must not be double-reversed.
- For uncached initial load, replace that chat's messages with the returned batch.
- For normal cached selected-chat polling, choose the lower-bound cursor in this order:
  1. `latestAcknowledgedOutgoingMessageId` when available,
  2. otherwise the latest cached/loaded message id for that chat.
- Fetch incremental new messages with `GET /api/telegram/chats/:chatId/messages?limit=25&after=<cursor>`.
- Merge incremental responses by `message.id`:
  - preserve existing older messages not present in the incremental batch,
  - update existing messages if any returned fields changed,
  - append new messages in ascending id/order,
  - avoid duplicates,
  - keep the full per-chat cache sorted oldest → newest.
- Recompute/advance `latestAcknowledgedOutgoingMessageId` while merging any returned or cached outgoing acknowledged messages, but never decrease it.
- `hasOlderMessages` should not be set to `false` just because an incremental `after` response returns fewer than `MESSAGE_BATCH_SIZE`; only initial/latest load without older cache can use `returned.length >= MESSAGE_BATCH_SIZE` as a heuristic.

#### Load older

- Use the current selected chat id and the oldest cached message id.
- Fetch `GET /api/telegram/chats/:chatId/messages?limit=25&before=<oldestMessageId>`.
- Prepend returned older messages after de-duplicating by id.
- Preserve the previous scroll anchor; the component should prevent visual jump after prepending.
- Set that chat's `hasOlderMessages` to `olderMessages.length >= MESSAGE_BATCH_SIZE`.
- If older load fails, keep existing cached messages and show an error.

#### Send append

- Append each returned sent message to the target chat cache by id.
- If the message already exists from a concurrent refresh, update/dedupe rather than duplicate.
- Capture whether the target chat is near bottom before each send/chunk append and expose scroll intent accordingly.
- When the target chat is visible and near bottom, set scroll intent so the component continues following latest/sent messages.
- When the target chat is visible but not near bottom, append sent messages without setting a force-bottom scroll intent; preserve the visible scroll position instead.
- Apply the same behavior for single messages, long-message chunk sends, and partial sends.

### Scroll state ownership

The hook may store `scrollTop` per `ChatMessageCacheEntry` via `setChatScrollTop(chatId, scrollTop)`, but it must not own DOM refs.

UI components own:

- `scrollRef`
- calculating `isNearBottom`
- restoring `scrollTop` after chat switches
- preserving anchor after older-message prepends
- deciding when to scroll to bottom based on hook state, local `isNearBottom`, and whether the update came from refresh, incoming message, send, chunk send, or partial send

Recommended implementation pattern:

- On scroll, the component calls `setChatScrollTop(selectedChatId, el.scrollTop)`.
- Before switching away, the latest scroll position is already in cache.
- After selecting a cached chat, component restores `entry.scrollTop` if defined; otherwise scrolls to bottom.
- On background refresh, component scrolls to bottom only if it was near bottom before refresh.
- On send success, including each long-message chunk success, component scrolls to bottom only if it was near bottom before that send/chunk append.
- On partial send failure, successfully sent chunks remain appended; if the user was not near bottom, the component keeps the reading position and does not jump to the sent chunks.
- The full `/chat-inbox` page and floating widget should implement the same scroll-intent contract even though their DOM/layout code remains separate.

### Polling intervals and visibility behavior

- Keep current constants unless implementation discovers a strong reason to tune them:
  - chat list: 15 seconds
  - selected messages: 10 seconds
- Poll only while `document.hidden === false`.
- Clear intervals on unmount and when selected chat changes.
- Selected message polling should call the cache-aware incremental refresh path using `after=<cursor>` once a cache entry exists, with `latestAcknowledgedOutgoingMessageId` preferred over latest cached message id.

### Cache sharing model

Recommended V1: cache is per hook instance / per mounted surface, not a global singleton or React context.

Implications:

- The standalone `/chat-inbox` page and the overlay widget do not share message bodies with each other.
- Within one mounted surface, chat switches are instant from that surface's cache.
- This avoids cross-surface stale-state coupling and hidden global retention of sensitive chat bodies.

A future V2 may introduce a provider/context shared at the app shell if M Jones wants cache continuity between widget and standalone page.

### Type consistency note

The current widget `TelegramMessage` interface is narrower than the standalone page/API shape. The shared hook should use the full API-compatible `TelegramMessage` type in both surfaces so reply/read/send/cache logic does not depend on divergent local interfaces.

## Edge cases and failure modes

- **Rapid A/B/C switching:** all selected chats should load independently; stale responses update only their own chat cache or are ignored if superseded.
- **Chat removed from list:** keep selected cached content visible if already selected, but show a clear error if refresh returns 404. If selecting from the chat list, removed chats should not be selectable.
- **Unauthorized Telegram session:** 401 should show the existing login-required error and preserve any already cached messages for the session.
- **Timeouts/abort:** show timeout errors without clearing cached messages.
- **Empty group chat:** an empty returned message list should display an empty state and `hasOlderMessages: false`.
- **Edited/reaction-updated messages:** merge should update cached fields for matching message ids.
- **Duplicate messages from older fetch + refresh:** de-dupe by `id` within each chat.
- **Message ids only unique per chat:** always key cache operations by `chatId` first, then `message.id`.
- **Partial send failure:** keep sent chunks, restore unsent chunks, and keep reply target unless all chunks sent.
- **Sending while switching chats:** append to the original target chat; do not append to newly selected chat.
- **Unmount during request:** abort or ignore state updates after unmount.
- **Cache cap eviction of selected chat:** selected chat must not be evicted while selected.
- **Privacy:** message bodies stay in memory only and are not written to `localStorage` or task logs by this refactor.

## Acceptance criteria / test matrix

### Unit/helper tests

Add or update tests where the repo's current test setup supports them:

- `splitTelegramMessageText` existing behavior remains unchanged.
- Message merge helper de-dupes by `id`, preserves older cached messages, updates edited/reaction fields, and sorts oldest → newest.
- Incremental polling helper chooses `latestAcknowledgedOutgoingMessageId` for `after` when present and falls back to latest cached/loaded message id before any outgoing ack exists.
- Incremental merge appends newer messages without refetching the latest 25 on every 10-second poll and preserves chronological order.
- Acknowledged cursor update treats outgoing messages with `reactionCount > 0` as acknowledged and keeps `latestAcknowledgedOutgoingMessageId` monotonic non-decreasing.
- Cache cap helper evicts least-recently-accessed non-selected chats and caps per-chat messages.
- Send-result handling restores unsent chunks after partial failure.
- Scroll-intent helper/state distinguishes near-bottom sends from reading-older sends so sent-message append does not always force bottom.
- API parameter handling accepts `before`, accepts `after`, and rejects the V1 conflict when both are supplied.

If helper functions are embedded in the hook and hard to test directly, extract pure helpers into the same module or a small sibling module for testing.

### Component/manual QA scenarios

Given/When/Then scenarios for manual or component tests:

1. **Cached chat switch**
   - Given Chat A has loaded messages
   - When M Jones opens Chat B and then Chat A
   - Then Chat A messages appear immediately without a blocking spinner.

2. **Uncached chat initial load**
   - Given Chat C has no cache entry
   - When M Jones opens Chat C
   - Then the loading state appears until messages load or an error appears.

3. **Older history persists**
   - Given Chat A is open
   - When M Jones clicks “Load older messages”, switches to Chat B, then returns to Chat A
   - Then the older messages remain visible in Chat A.

4. **No scroll-yank while reading**
   - Given M Jones scrolled upward in Chat A
   - When selected-message polling refreshes Chat A
   - Then the scroll position is not forced to the bottom.

5. **Near-bottom refresh**
   - Given M Jones is near the bottom in Chat A
   - When a poll returns a new message
   - Then the new message appears and the thread remains at/near bottom.

6. **Acknowledged-cursor incremental poll**
   - Given Chat A has cached messages and an outgoing M Jones message with `reactionCount > 0`
   - When the 10-second selected-message poll runs
   - Then it requests `after=<latestAcknowledgedOutgoingMessageId>`, appends/merges any newer messages, preserves chronological order, and does not refetch the latest 25-message window as the core path.

7. **Fallback incremental poll before ack**
   - Given Chat A has cached messages but no acknowledged outgoing message yet
   - When the selected-message poll runs
   - Then it falls back to `after=<latestCachedMessageId>` and appends/merges newer messages chronologically.

8. **Rapid switching**
   - Given a message load for Chat A is in flight
   - When M Jones selects Chat B
   - Then Chat B can start loading immediately and Chat A's response cannot overwrite Chat B's visible messages.

9. **Send chunks success while near bottom**
   - Given composer text exceeds 4096 characters and M Jones is near the bottom
   - When M Jones sends
   - Then chunks are sent sequentially, first chunk carries reply metadata if replying, all returned messages append to the selected chat cache, the thread continues following the sent chunks at/near bottom, and composer/reply state clears after success.

10. **Send while reading older messages**
   - Given M Jones is scrolled up reading older messages in either the full `/chat-inbox` page or floating widget
   - When M Jones sends a normal one-chunk message
   - Then the sent message appends to the chat cache/thread without forcing the visible thread to the bottom.

11. **Long-message send while reading older messages**
   - Given M Jones is scrolled up reading older messages in either the full `/chat-inbox` page or floating widget
   - When M Jones sends text that splits into multiple chunks
   - Then all successful chunks append to the chat cache/thread without yanking the visible scroll position to the bottom.

12. **Send chunks partial failure while reading older messages**
    - Given M Jones is scrolled up, chunk 1 succeeds, and chunk 2 fails
    - When M Jones sends
    - Then chunk 1 remains appended, unsent chunks remain in composer, error is shown, the chat list refreshes, and the visible scroll position remains on the older-message reading location.

13. **Read/unread**
   - Given Chat A has unread messages
   - When M Jones opens Chat A and messages load
   - Then Chat A unread count becomes 0 locally and `PATCH /messages` is called best-effort.

14. **Refresh failure with cache**
    - Given Chat A has cached messages
    - When background refresh fails
    - Then cached messages remain visible and a non-blocking error is shown.

### Typecheck/lint/build gates

Run the smallest meaningful verification after implementation:

```bash
npm run test
npm run lint
npm run build
```

If a script is unavailable or fails for unrelated pre-existing reasons, document the exact command, failure, and why it is out of scope.

### API smoke checks

Manual smoke or mocked fetch verification should cover:

- `GET /api/telegram/chats?limit=100`
- `GET /api/telegram/chats/:chatId/messages?limit=25`
- `GET /api/telegram/chats/:chatId/messages?limit=25&before=<id>`
- `GET /api/telegram/chats/:chatId/messages?limit=25&after=<id>`
- `GET /api/telegram/chats/:chatId/messages?limit=25&before=<id>&after=<id>` returns the documented V1 conflict response, recommended `400`
- `POST /api/telegram/chats/:chatId/messages`
- `PATCH /api/telegram/chats/:chatId/messages`

No server route contract changes are expected beyond the bounded `after` query parameter and the explicit `before`/`after` conflict behavior.

## Migration / implementation plan

1. **Update message API for incremental polling**
   - Preserve `before=<messageId>` older pagination.
   - Add `after=<messageId>` newer polling using `client.getMessages(dialog.inputEntity, { limit, minId: afterMessageId, reverse: true })`.
   - Reject combined `before` and `after` in V1.
   - Keep `MESSAGE_BATCH_SIZE = 25` as the default limit.

2. **Extract shared types and fetch helpers**
   - Move compatible `TelegramChat`, full `TelegramMessage`, constants, `fetchJson`, and relevant pure helpers into `useTelegramChatInbox.ts` or adjacent files.
   - Keep `LinkifiedText` and visual components unchanged.

3. **Implement cache primitives**
   - Add per-chat `ChatMessageCacheEntry` state, refs for current cache/chats/selection, merge/dedupe helpers, cap/eviction helper, per-chat in-flight guards, and monotonic `latestAcknowledgedOutgoingMessageId` tracking.

4. **Move chat list loading/selection into hook**
   - Preserve chat list polling, last-chat localStorage key, and loading/error behavior.

5. **Move message refresh/loading older into hook**
   - Implement cache-aware initial load, acknowledged-cursor `after` polling, fallback latest-cached-id polling, stale response handling, older-message prepend, per-chat loading flags, and mark-read behavior.

6. **Move send behavior into hook**
   - Preserve chunking, reply metadata on first chunk only, partial failure behavior, append-to-target-chat behavior, and chat-summary refresh.

7. **Wire standalone page to hook**
   - Replace local data/fetch/send state with hook state/actions.
   - Keep standalone layout, copy, scroll DOM behavior, and composer/reply state local.

8. **Wire widget to hook**
   - Replace duplicated local data/fetch/send state with the same hook.
   - Keep expanded/non-expanded layout behavior local.

9. **Add focused tests**
   - Prefer pure helper tests first, then component/manual scenarios as practical.

10. **Run verification gates**
   - Execute `npm run test`, `npm run lint`, and `npm run build` or document blockers.

11. **Update implementation notes**
   - Mark this spec approved/implemented as appropriate after M Jones approval and implementation completion.

## Risks / open questions requiring M Jones approval

1. **Cache sharing across surfaces:** recommend V1 per hook instance/per mounted surface. Approve this, or request global/context cache shared between widget and standalone page?
2. **Cache cap:** recommend max 20 chats and 150 messages per chat in memory. Approve these limits?
3. **Scroll position:** recommend best-effort in-memory scroll restoration per chat. Is this required for V1 acceptance, or nice-to-have behind the main cache fix?
4. **Build gate:** `npm run build` may be slower than focused tests/lint. Should implementation require full build before handoff, or is test+lint acceptable if the code path is small?
5. **SessionStorage:** recommend no `sessionStorage` for V1. Approve memory-only cache?

## Rollback plan

- The refactor should be contained to the new hook and the two chat UI surfaces.
- If issues appear, revert the hook wiring commit and restore previous per-component state logic.
- Because no database/API/server contract changes are planned, rollback should not require data migration.
- If partial rollback is needed, the standalone page and widget can be rewired one at a time because V1 recommends per-surface hook instances.

## Approval request

M Jones, please approve or revise:

- [ ] Create `src/components/chat/useTelegramChatInbox.ts` as the shared data/cache hook.
- [ ] Add `after=<messageId>` newer-message polling while preserving `before=<messageId>` older pagination and rejecting combined `before`/`after` in V1.
- [ ] Use per-chat `latestAcknowledgedOutgoingMessageId` as the preferred normal polling lower-bound cursor, falling back to latest cached/loaded message id when no outgoing ack exists.
- [ ] Use memory-only per-hook-instance cache for V1, not global context or browser storage.
- [ ] Cache up to 20 opened chats and 150 messages per chat.
- [ ] Keep older-message loading button-only; no auto-load on scroll.
- [ ] Treat latest-window reconciliation, if added, as coarse/low-priority metadata-drift fallback rather than the core 10-second polling design.
- [ ] Preserve read/unread and bridge/status auto-read behavior as currently implemented.
- [ ] Require implementation verification with tests plus lint/build where available.
