# Telegram Reply Previews + Reply-Chain Viewer PRD / Engineering Spec

## Status

- **Owner:** M Jones
- **Draft owner:** Finn research subagent
- **Date:** 2026-05-19
- **Status:** Draft for Finn/main-session review, then M Jones approval
- **Scope:** Mission Control Telegram Chat Inbox full page + widget reply visibility, reply previews, thread/chain panel, and related Telegram/OpenClaw reply behavior
- **Important handoff note:** This is a local review artifact only. Finn/main session must create a Google Doc version after review if this should become the approval-facing artifact. This subagent did **not** create external docs.

## 1. Executive summary

Mission Control already preserves the raw Telegram reply target id for fetched text messages (`replyToMessageId`) and already sends manual Mission Control replies with GramJS `sendMessage(..., { replyTo })`. However, the UI does not render Telegram-style reply previews, the widget type currently omits reply metadata, and there is no way to inspect the local reply chain/history from Mission Control.

Recommended V1:

1. **Render reply previews inline on message bubbles** whenever `replyToMessageId` exists.
2. **Resolve missing reply targets on demand** with `client.getMessages(dialog.inputEntity, { ids: [...] })`, exposed through a bounded API path, rather than requiring the target to already be in the visible window.
3. **Add a `Thread` action** next to/near the existing `Reply` action for messages that either reply to another message or have known cached replies.
4. **Open a focused thread/chain panel** showing the selected message's parent ancestry plus the selected message, and optionally cached child replies in a clearly labeled section. Do **not** promise exhaustive child replies in normal groups in V1.
5. **Keep Telegram as source of truth** and store only bounded, in-memory/session reply metadata unless the broader cache refactor later introduces a shared hook.
6. **For agent replies, prefer OpenClaw's native reply-threading controls** (`channels.telegram.replyToMode` and `[[reply_to_current]]`) rather than trying to make Mission Control rewrite agent messages. Mission Control can display the result; OpenClaw should be responsible for outbound bot/agent reply targeting.

The main technical finding is that Telegram/GramJS supports fetching specific messages by id for groups/supergroups/channels. GramJS also exposes `iterMessages/getMessages(..., { replyTo: msgId })`, which maps to `messages.GetReplies`, but GramJS documents it as only usable for broadcast channels and linked supergroups/comments/thread contexts; using it in ordinary chats/private conversations can fail with `PEER_ID_INVALID`. Therefore V1 should not depend on `GetReplies` for normal group reply-chain discovery.

## 2. Problem statement and goals

### Problem statement

Mission Control Chat Inbox currently behaves like a basic text chat transcript. Telegram replies are technically present in the data model as `replyToMessageId`, but M Jones cannot see which message a bubble is replying to, cannot quickly recover the context of a reply when the parent is outside the loaded window, and cannot open a focused view of a reply chain. This makes active Telegram groups harder to follow from Mission Control than from Telegram's own UI.

Agent interactions add another layer: when M Jones replies to Finn's message in Telegram, Finn's response should ideally attach to M Jones's specific reply so the chain remains navigable in Telegram and in Mission Control. If this is not automatic, reply previews and thread views will still be less useful because agent responses may appear as unthreaded messages.

### Goals

1. Make Telegram reply relationships visible in both Mission Control Telegram UI surfaces.
2. Show a compact Telegram-style preview above the message body for messages with `replyToMessageId`.
3. Resolve missing preview targets when feasible without broad history mirroring.
4. Add a `Thread` button/action for messages that are part of a reply chain.
5. Provide a focused panel/popout that shows the relevant reply chain/history without leaving the current chat.
6. Keep behavior compatible with the planned shared message-cache hook and `after` polling refactor.
7. Define a safe, narrow agent reply behavior policy that uses OpenClaw/Telegram reply facilities where possible.
8. Keep the V1 implementation bounded, testable, and resilient to missing/deleted/inaccessible Telegram messages.

### Non-goals

- Do not build a full Telegram clone.
- Do not persist a durable mirror of all Telegram message bodies.
- Do not guarantee exhaustive child-reply discovery for ordinary Telegram groups in V1.
- Do not send automated messages or alter OpenClaw agent routing as part of Mission Control UI work without separate approval.
- Do not add media/file reply previews in V1; text-only previews with unavailable/media fallbacks are sufficient.
- Do not support private DMs/channels beyond the group-chat scope already defined for Telegram Chat Inbox V1.

## 3. Current state inventory

### Server-side Telegram message model

`src/lib/telegram/messages.ts` defines:

```ts
export interface TelegramTextMessage {
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
```

Current mapper behavior:

- Drops non-text messages: `if (!message.message) return null`.
- Stores total `reactionCount` from `message.reactions?.results`.
- Stores `replyToMessageId` from `message.replyTo?.replyToMsgId || null`.
- Does not store `replyToTopId`, `replyToPeerId`, `quoteText`, `quoteEntities`, `forumTopic`, reply media summary, or unavailable/deleted status.
- Sets `senderName: null`; the UI currently displays incoming senders as generic `Telegram`.

### API route

`src/app/api/telegram/chats/[chatId]/messages/route.ts` currently supports:

- `GET ?limit=<n>&before=<id>` only.
- `POST` with `{ text, replyToMessageId }`, passed to `sendTelegramGroupChatMessage`.
- `PATCH` with `{ maxMessageId }` for mark-read.

Missing for reply previews/threading:

- No `after` yet in current implementation, though the cache refactor spec recommends it.
- No endpoint to resolve specific message ids.
- No endpoint to return reply target previews or chain ancestry.
- No validation to reject impossible `replyToMessageId` targets beyond Telegram's send-time behavior.

### Full page UI

`src/components/chat/TelegramChatInboxPage.tsx` has a full `TelegramMessage` type including `replyToMessageId`. It:

- Maintains one global `messages` array for the selected chat.
- Renders each bubble with sender label, ack status, `Reply` button, timestamp, and body text.
- Does not render reply previews.
- Does not show a `Thread` button.
- Uses `setReplyingTo(message)` for composer reply state.
- Sends only the first long-message chunk with `replyToMessageId`.

### Widget UI

`src/components/chat/TelegramChatWidgetContent.tsx` currently defines a narrower `TelegramMessage`:

```ts
interface TelegramMessage {
  id: number;
  text: string;
  isOutgoing: boolean;
  reactionCount: number;
  sentAt: string;
}
```

But it also uses `replyingTo` and posts `replyToMessageId: replyingTo?.id`. Missing fields in the local type mean the widget cannot currently render reply relationships consistently and will need to adopt the full API-compatible message shape, as already recommended by the cache refactor spec.

### Cache refactor interaction

`docs/telegram-chat-message-cache-refactor-spec.md` recommends a shared `useTelegramChatInbox.ts` hook with per-chat cache entries, full `TelegramMessage` shape, `after=<messageId>` polling, and per-chat message arrays. This reply/thread work should either:

1. land after that refactor and build directly on the shared hook, or
2. implement only a minimal interim structure that can be moved into the hook without changing API contracts.

Best sequencing: **cache/shared-hook refactor first, reply previews/thread viewer second**. If product urgency requires reply previews first, keep the API additions and pure helpers reusable.

## 4. Telegram/GramJS capability findings with evidence

### 4.1 Current message reply metadata source

GramJS `Api.Message` exposes `replyTo?: Api.TypeMessageReplyHeader`; local TL types show `MessageReplyHeader` includes:

- `replyToMsgId?: int`
- `replyToPeerId?: Api.TypePeer`
- `replyToTopId?: int`
- `quoteText?: string`
- `quoteEntities?: Api.TypeMessageEntity[]`
- `replyMedia?: Api.TypeMessageMedia`
- `forumTopic?: boolean`

Evidence: `node_modules/telegram/tl/api.d.ts` around `MessageReplyHeader`.

Mission Control currently uses only `message.replyTo?.replyToMsgId`.

### 4.2 Fetching a specific replied-to message by id

GramJS supports fetching specific message ids through `client.getMessages(entity, { ids })`.

Local evidence:

- `node_modules/telegram/client/messages.d.ts` documents `ids?: number | number[] | Api.TypeInputMessage | Api.TypeInputMessage[]`, says it takes precedence over other params, and notes nonexistent messages may appear as `undefined`.
- `node_modules/telegram/client/messages.js` uses `_IDsIter` when ids are supplied.
- For channel/supergroup entities, `_IDsIter` invokes `Api.channels.GetMessages({ channel, id: ids })`.
- For non-channel entities, `_IDsIter` invokes `Api.messages.GetMessages({ id: ids })` and filters returned messages by the supplied entity peer when an entity is present.

External docs evidence:

- Telegram `messages.getMessages` returns messages by id list and is usable by users and bots.
- Telegram `channels.getMessages` returns channel/supergroup messages by id list and is usable by users and bots.

Conclusion: **Yes, Mission Control can fetch a missing reply target by id using `client.getMessages(dialog.inputEntity, { ids: [replyToMessageId] })`.** It should handle empty/undefined results, deleted messages, non-text messages, inaccessible/private channel errors, and peer mismatch.

### 4.3 Fetching reply chains or child replies

GramJS exposes `replyTo` in `iterMessages/getMessages` params:

- `IterMessagesParams.replyTo?: number` is documented as returning messages that reply to the given id.
- Local `messages.js` maps this to `Api.messages.GetReplies({ peer, msgId: replyTo, ... })`.
- Telegram docs for `messages.getReplies` say it gets messages in a reply thread and returns `messages.Messages`.

Important limitation:

- GramJS type docs state: this feature is also known as comments in broadcast channels or viewing threads in groups, and “can only be used in broadcast channels and their linked supergroups. Using it in a chat or private conversation will result in PEER_ID_INVALID error.”
- Telegram `messages.getReplies` docs list errors including `PEER_ID_INVALID`, `MSG_ID_INVALID`, and `TOPIC_ID_INVALID`.

Conclusion: `messages.getReplies` is useful for Telegram discussion/comment/forum-like thread contexts but **should not be assumed to work as a universal child-reply lookup for ordinary group replies**. For Mission Control's V1 group-chat inbox, build parent ancestry by following `replyToMessageId` links and include child replies only from messages already loaded/cached, unless a small empirical read-only test later confirms wider `GetReplies` support for the exact target chat type.

### 4.4 Sending a reply

Current code already sends a reply through GramJS:

```ts
client.sendMessage(dialog.inputEntity, {
  message: trimmed,
  replyTo: replyToMessageId,
  parseMode: false,
  linkPreview: false,
});
```

Local `messages.js` converts this into `Api.InputReplyToMessage({ replyToMsgId, topMsgId })` when `replyTo` is provided. This is the correct GramJS path for manual Mission Control sends as M Jones.

### 4.5 OpenClaw/Telegram agent reply controls

OpenClaw Telegram channel docs state:

- Generated output may include `[[reply_to_current]]` to reply to the triggering Telegram message.
- Generated output may include `[[reply_to:<id>]]` to reply to a specific Telegram message id.
- `channels.telegram.replyToMode` supports `off` (default), `first`, and `all`.
- Explicit `[[reply_to_*]]` tags are honored even when `replyToMode` is `off`.
- When reply threading is enabled and original Telegram text/caption is available, OpenClaw includes a native Telegram quote excerpt automatically, capped by Telegram quote limits.

Conclusion: Finn/OpenClaw can probably reply to the current inbound message reliably **when the inbound Telegram message id is present in runtime metadata**. Mission Control should not duplicate that delivery responsibility; it should display the resulting Telegram reply metadata.

## 5. Product/UX requirements

### Reply preview requirements

1. If a message has `replyToMessageId`, render a compact preview block inside the bubble above the message body.
2. Preview should be visually subordinate to the message body, Telegram-like, and fit both full page and widget.
3. Preview should include, when available:
   - sender label (`You`, resolved sender name, or `Telegram` fallback),
   - one-line text excerpt,
   - unavailable/deleted/fallback state when target cannot be resolved.
4. Preview must not expand the bubble excessively; clamp to 1–2 lines.
5. Preview click behavior in V1 should be useful but safe:
   - If target message is loaded in the current chat cache, scroll/jump to it and briefly highlight it.
   - If not loaded, attempt bounded target resolve; then open the thread panel anchored to the selected message/target rather than silently doing nothing.
   - If resolve fails, show non-blocking unavailable state.
6. The widget must not regress its compactness; previews can use smaller text and fewer details.

### Thread button requirements

1. Add `Thread` action styled similarly to `Reply`, near the existing `Reply` action or lower corner of the bubble.
2. Show `Thread` when:
   - message has `replyToMessageId`, or
   - any loaded/cached message in the same chat has `replyToMessageId === message.id`, or
   - message has richer reply/thread metadata (`replyToTopId`, forum topic/thread marker) once exposed.
3. Do not show `Thread` on every message in V1 if there is no known chain membership; avoid visual noise.
4. If a user opens a thread for a message with unknown/missing ancestors, the panel should explain “Some earlier messages could not be loaded” rather than failing.

### Thread panel requirements

1. Clicking `Thread` opens a right-side panel in the full page and a modal/bottom-sheet-like popout in the widget.
2. The panel shows only the selected reply chain/history, not the whole chat.
3. The panel is scrollable and focused.
4. The panel supports close/back.
5. Each message row in the panel should preserve basic sender/time/body and reply preview context.
6. V1 should clearly distinguish parent ancestry from child replies if child replies are not exhaustive.

### Performance and privacy requirements

1. Do not fetch or store broad hidden history just to render previews.
2. Batch resolve missing reply targets where possible.
3. Cache resolved targets per chat during the mounted session/shared hook lifetime.
4. Respect Telegram flood waits and avoid tight fetch loops when following long chains.
5. Do not include sensitive Telegram text in logs beyond existing safe error handling.

## 6. Technical design options

### Option A — Preview only from loaded messages

Render previews only when `replyToMessageId` points to a message already in the local `messages` array/cache.

Pros:

- Smallest implementation.
- No new API surface.
- No extra Telegram fetches.

Cons:

- Poor UX for the common case where the parent is just outside the loaded 25-message window.
- Thread panel is often incomplete.
- M Jones specifically wants replies visible/useful; fallback-only previews would feel half-built.

Recommendation: **Do not choose as final V1**, but it can be the first implementation milestone.

### Option B — On-demand target resolution by id

Add a bounded API/library path to fetch specific message ids in a chat. Use it for missing reply previews and parent-chain construction.

Pros:

- Uses supported GramJS/Telegram APIs.
- Keeps local cache bounded.
- Works for parent ancestry in normal groups.
- Fits shared cache refactor naturally.

Cons:

- Extra API calls and loading states.
- Still cannot discover all children/replies in normal groups.
- Needs careful batching/error handling.

Recommendation: **Use for V1.**

### Option C — Use `messages.getReplies` for thread children

Use GramJS `getMessages(entity, { replyTo: messageId })` / Telegram `messages.getReplies` to fetch child replies.

Pros:

- Could return proper thread replies for channel comments/linked supergroups/forum contexts.
- Telegram-native thread semantics when available.

Cons:

- GramJS docs warn this is not universal and can fail in chats/private conversations.
- Mission Control V1 is group-chat focused, and current target groups may be ordinary groups/supergroups without comment-thread semantics.
- Product behavior would be inconsistent across chat types.

Recommendation: **Do not depend on this for V1 normal reply chains.** Consider as optional enhancement behind a capability probe or explicit thread-context path later.

### Option D — Durable local reply graph/index

Store every fetched message and reply edge in a database table to answer chain/child queries locally.

Pros:

- Fast local child lookup for previously seen messages.
- Good foundation for richer history/search.

Cons:

- Conflicts with V1 principle: no durable broad Telegram message mirror.
- Adds privacy, retention, migration, and cleanup complexity.

Recommendation: **Out of scope for V1.**

## 7. Recommended V1 design

Recommended V1 is **Option B with a conservative child-reply view**:

1. Extend normalized message shape with optional reply metadata and optional resolved preview target.
2. Add a message-id resolution path that fetches specific messages by id for one chat.
3. Build a per-chat in-memory `messagesById` cache and `replyChildrenByParentId` index from loaded/resolved messages.
4. Render inline reply previews using loaded/resolved target data.
5. Add `Thread` action for messages with a parent or known cached children.
6. Thread panel shows:
   - **Parent chain:** oldest resolved ancestor → ... → selected message.
   - **Known replies:** direct/descendant replies from currently loaded/resolved cache, labeled as “Known replies in loaded history” if included.
7. Do not promise exhaustive replies in V1 unless the chat is known to support `messages.getReplies` and implementation explicitly handles that capability.
8. Agent reply behavior remains an OpenClaw policy/config concern; Mission Control displays reply chains produced by Telegram metadata.

Why parent chain first? Parent ancestry is deterministic because each message has at most one reply parent (`replyToMessageId`). It can be resolved with bounded id fetches. Child replies are fan-out and cannot be exhaustively discovered in ordinary groups without scanning history or relying on `GetReplies`, so V1 should avoid overpromising.

## 8. Reply preview design

### Data shape

Extend `TelegramTextMessage` / `TelegramMessage` with optional fields:

```ts
export interface TelegramReplyTargetPreview {
  id: number;
  chatId: string;
  text: string | null;
  senderId: string | null;
  senderName: string | null;
  isOutgoing: boolean;
  sentAt: string | null;
  unavailableReason?: 'not_loaded' | 'deleted' | 'inaccessible' | 'non_text' | 'error';
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
  replyToTopId?: number | null;
  replyQuoteText?: string | null;
  replyPreview?: TelegramReplyTargetPreview | null;
  editedAt: string | null;
}
```

Notes:

- `replyPreview` can be omitted from the initial list response and filled client-side from cache/resolution responses.
- `replyQuoteText` comes from Telegram's reply header when present. It can seed the preview while the full target loads, but should not be treated as authoritative full message text.
- `senderName` should be improved separately or in the same pass if user/chat entity data is already available from GramJS responses. If not, use `You` / `Telegram` fallback.

### Visual layout

Full page bubble:

```text
┌────────────────────────────────────┐
│ ▌ Reply to You                     │
│ ▌ Please add reply previews…       │
│                                    │
│ Main message body                  │
│ Reply   Thread              9:41 PM│
└────────────────────────────────────┘
```

Widget bubble should use a tighter variant:

```text
▌ You · Please add reply previews…
Main message body
Reply  Thread  9:41
```

Styling recommendation:

- Small left accent bar using `mc-accent` or outgoing/incoming-aware accent.
- Preview background slightly darker/lighter than bubble body, low contrast but readable.
- Sender line at `text-[10px]`/`text-[11px]`, excerpt clamped/truncated.
- Cursor/hover only if click action is available.
- Avoid rendering raw control tags or untrusted HTML; keep using plain text/React text and existing `LinkifiedText` only for actual message body unless intentionally linkifying preview excerpts.

### Preview fallback states

- `not_loaded`: “Replying to message #12345” with subtle loading/resolve affordance.
- `deleted`: “Original message unavailable.”
- `non_text`: “Original message is not a text message.”
- `inaccessible`: “Original message can’t be loaded.”
- `error`: “Couldn’t load original message.”

If `replyQuoteText` exists, show it immediately as a quote excerpt with a pending/secondary state until full target is resolved.

### Click behavior

V1 behavior:

1. If target id exists in current chat cache and DOM node is mounted: scroll to it, temporary highlight.
2. If target id exists in cache but not mounted due to panel/filter: open thread panel with that target context.
3. If target id is not cached: call resolve-by-ids endpoint, cache result, then open thread panel or jump if the message is in current rendered range.
4. If target cannot be loaded: keep fallback state; clicking opens thread panel with unavailable parent row.

Avoid auto-loading arbitrary older pages to find a parent; use id fetch instead.

## 9. Thread/chain viewer design

### V1 content model

For a selected message `M`:

1. Walk parent ancestry:
   - start at `M`, follow `replyToMessageId`, fetch missing parent by id if needed,
   - stop when no parent, parent unavailable, chain depth limit reached, or cycle detected.
2. Reverse ancestry for display oldest → newest.
3. Include selected message and label/anchor it.
4. Optionally include cached descendants:
   - direct children where `replyToMessageId === M.id`,
   - optionally recursive descendants from current in-memory/cache index,
   - label section “Known replies in loaded history” to avoid implying completeness.

Recommended depth/page limits:

- Parent depth limit: 20 messages in V1.
- Batch missing parent ids sequentially or in small batches; since each parent id is discovered from the fetched parent, pure ancestry is naturally iterative.
- Child cached display: cap at 50 known messages initially.

### Thread panel UI states

- Closed.
- Opening/loading chain.
- Loaded with chain.
- Partial with unavailable ancestors.
- Error with retry.

Panel header:

- Chat title.
- “Reply thread” title.
- Close button.
- Optional “Open in Telegram” only if Mission Control later has deep links; out of scope for V1.

Panel row actions:

- Reply: sets composer reply target to that row's message and closes or keeps panel open depending on UX preference.
- Jump: scrolls main transcript to message if loaded.
- Copy: optional, if existing message actions later include it; not required for V1.

### Thread button eligibility

Create helper:

```ts
function isMessageInReplyChain(message: TelegramMessage, replyChildrenByParentId: Map<number, number[]>): boolean {
  return Boolean(message.replyToMessageId || replyChildrenByParentId.get(message.id)?.length);
}
```

If `replyToTopId` is added later, include it as a chain membership signal.

## 10. Agent reply behavior policy

### Desired behavior

When M Jones replies to a Finn/OpenClaw agent message in Telegram, Finn's response should ideally be a Telegram reply to M Jones's specific triggering message. That preserves the chain:

```text
Finn message A
  ↳ M Jones reply B
      ↳ Finn response C
```

### OpenClaw capability

OpenClaw Telegram supports:

- `[[reply_to_current]]` for generated output.
- `[[reply_to:<id>]]` for explicit message id replies.
- `channels.telegram.replyToMode` values `off`, `first`, `all`.
- Explicit tags honored even when `replyToMode` is `off`.

### Recommended policy

1. **Do not make Mission Control rewrite or resend agent responses.** Mission Control's Telegram user-client sends as M Jones; agent/bot responses are handled by OpenClaw Telegram delivery.
2. **Configure Finn/OpenClaw reply threading for this Telegram group if M Jones approves.** Prefer `replyToMode: first` for agent responses in group chats where reply-chain continuity matters. `all` may be noisy for multi-message/chunked outputs.
3. **Use explicit `[[reply_to_current]]` only where the runtime/system prompt requires it or where `replyToMode` is off.** Avoid exposing tags in visible output; OpenClaw already strips control tags in delivery/display paths per changelog/docs.
4. **When Finn is responding to a Telegram inbound message, prefer replying to the triggering message, not the earlier message that M Jones replied to.** This keeps the immediate conversational chain intact.
5. **Manual override:** If M Jones asks Finn to reply under a specific earlier message id, Finn can use `[[reply_to:<id>]]` where the id is known/provided.
6. **No automatic sends from Mission Control UI.** Browsing/reply previews/thread panel should not dispatch agent work.

### Feasibility and caveats

Feasible if OpenClaw has current inbound Telegram message id metadata available in the agent runtime. OpenClaw docs and changelog indicate inbound metadata includes message ids and reply ids for prompt/tool targeting. If an empirical check is needed later, use logs/config inspection or a controlled read-only review of Telegram channel runtime metadata; do not send test messages without M Jones approval.

## 11. API/cache/data model changes

### Library additions

Add a read-only resolver in `src/lib/telegram/messages.ts`:

```ts
export async function getTelegramGroupChatMessagesByIds(
  chatId: string,
  ids: number[],
): Promise<TelegramTextMessage[]>;
```

Behavior:

- Check authorization and group dialog through existing `findAuthorizedGroupDialog`.
- Validate ids: positive integers, dedupe, cap count (e.g. max 50/request).
- Call `client.getMessages(dialog.inputEntity, { ids })`.
- Normalize with existing/enhanced `messageToTextMessage`.
- Preserve result ids; return only readable text messages or include unavailable placeholders depending on API design.
- Do not log message text on errors.

Potential helper:

```ts
function messageToReplyTargetPreview(message: Api.Message | undefined, chatId: string): TelegramReplyTargetPreview
```

### API additions

Option 1: Extend existing GET with `ids`:

`GET /api/telegram/chats/:chatId/messages?ids=123,456`

Rules:

- `ids` is mutually exclusive with `before` and `after`.
- max ids/request: 50.
- return `{ messages }` in requested order where possible, plus unavailable placeholders if desired.

Option 2: Add a nested endpoint:

`GET /api/telegram/chats/:chatId/messages/resolve?ids=123,456`

Recommended: **Option 1 is smaller**, but Option 2 has clearer semantics and avoids overloading pagination. If implementing alongside `after`, Option 2 may be cleaner.

Thread chain endpoint? Not required for V1 if the client can iteratively resolve ids. Optional later:

`GET /api/telegram/chats/:chatId/messages/:messageId/thread?direction=parents&limit=20`

Recommendation: keep V1 simpler with resolve-by-ids plus client-side chain assembly in shared hook.

### Client cache additions

In the planned shared hook cache entry, add:

```ts
messagesById: Map<number, TelegramMessage>;
replyChildrenByParentId: Map<number, Set<number>>;
resolvedReplyTargetIds: Set<number>;
failedReplyTargetIds: Map<number, TelegramReplyTargetPreview['unavailableReason']>;
activeThread: {
  anchorMessageId: number;
  chainMessageIds: number[];
  knownChildMessageIds: number[];
  loading: boolean;
  error: string | null;
} | null;
```

If React state serialization makes `Map` awkward, store plain objects internally and memoize derived arrays/maps.

### Polling/cache interaction

- Initial/latest-window fetch should upsert messages by id and update reply indexes.
- `after` polling should upsert new messages and resolve previews for any newly seen `replyToMessageId` not in cache.
- Latest-window reconciliation should refresh edited text/reaction counts for messages by id and update preview text if target messages changed.
- Older-message loads should upsert and may satisfy previously unresolved previews.
- Resolved parent messages outside the visible window should be cached by id but not necessarily inserted into the main chronological transcript unless they were fetched as part of normal history pagination. This avoids surprising jumps/gaps in the main transcript.

### Data retention

V1 reply target bodies should live only in the mounted/shared in-memory cache unless broader Mission Control cache policy changes. Do not persist to `localStorage` or a database in this feature.

## 12. Edge cases/failure modes

1. **Parent message outside loaded window:** resolve by id; show loading/fallback until resolved.
2. **Deleted parent:** show “Original message unavailable.”
3. **Non-text parent/media:** show “Original message is not a text message” or a media-type placeholder if easily available later.
4. **Reply across peer (`replyToPeerId`):** V1 group inbox should treat cross-peer replies as inaccessible unless safely resolvable in same chat; do not fetch other chats by default.
5. **Forum topics:** preserve `replyToTopId`/thread metadata when available; do not send to topic-specific APIs unless already supported by existing chat scope.
6. **Long parent chains:** cap traversal and show “Thread truncated.”
7. **Cycles/bad data:** detect visited ids and stop.
8. **Telegram flood waits/rate limits:** batch ids, cache failures, avoid repeated retries every render.
9. **Access errors:** convert with existing safe Telegram error handling; avoid sensitive logs.
10. **Message edits:** latest-window reconciliation should update cached preview text; no guarantee for old resolved parents outside reconciliation window.
11. **Message deletes after preview resolved:** V1 may retain resolved text until refresh unless explicit delete updates are implemented; acceptable if documented because Telegram remains source of truth and cache is ephemeral.
12. **Widget compact layout:** preview/thread panel must not overflow or make the composer unusable.
13. **Concurrent chat switches:** replies resolved for Chat A must not be applied to Chat B. Key all caches by `chatId`.
14. **Manual send reply target deleted before send:** Telegram may reject; show safe send error and keep composer/reply target.
15. **Agent reply not threaded:** display as unthreaded; do not infer a reply edge based on temporal proximity.

## 13. Acceptance criteria/test plan

### Unit tests

Add/extend tests for pure helpers:

1. `messageToTextMessage` maps `replyTo.replyToMsgId`, `replyToTopId`, and `quoteText` when present.
2. `buildReplyIndexes(messages)` returns children by parent id.
3. `buildParentChain(anchor, messagesById, fetchMissing)` stops on no parent, unavailable parent, depth limit, and cycle.
4. `isMessageInReplyChain` returns true for messages with parent or known children.
5. API query parsing rejects invalid ids: empty, non-integer, negative, too many ids, mixed with `before/after` if using existing route.
6. Send behavior still includes `replyToMessageId` only on first chunk.

### API/library tests with mocks

1. `getTelegramGroupChatMessagesByIds` calls GramJS `getMessages(dialog.inputEntity, { ids })` with deduped ids.
2. Channel/supergroup and basic group branches are handled by GramJS; app-level code should not assume result count equals id count.
3. Missing/undefined messages become unavailable placeholders or are omitted according to chosen contract.
4. Authorization/group-not-found errors preserve existing 401/404 behavior.

### UI/component tests

1. Message with resolved `replyPreview` renders preview above body.
2. Message with unresolved `replyToMessageId` renders fallback/loading preview.
3. `Thread` button appears only for chain messages.
4. Clicking preview scrolls/highlights loaded target.
5. Clicking preview for missing target invokes resolver and opens thread panel on success/fallback.
6. Thread panel displays parent chain in chronological order.
7. Widget uses full message type and renders compact preview without layout break.

### Manual QA scenarios

Given a Telegram group with message A and reply B:

- When B is in the latest window and A is in the latest window, B shows a preview of A.
- When B is in the latest window and A is older than loaded history, B initially shows resolving/fallback then displays A after id resolution.
- When M Jones clicks B's `Thread`, panel shows A → B.
- When another loaded message C replies to B, B's `Thread` panel shows C under “Known replies in loaded history.”
- When A is deleted or inaccessible, B shows an unavailable preview and panel still opens with B.
- When M Jones uses Mission Control `Reply` on A, the sent message in Telegram is a reply to A and Mission Control renders its preview after send.
- When M Jones replies to Finn in Telegram and Finn responds, verify whether Finn's response is threaded according to current OpenClaw config; if not, record config/task follow-up rather than treating Mission Control UI as failed.

### Regression checks

- Existing chat list loading still works.
- Existing message loading before/older behavior still works.
- Existing manual send/reply still works.
- Mark-read still best-effort.
- Long-message chunking remains unchanged.
- Linkified body text remains unchanged.
- No new persistent storage of Telegram message bodies.

## 14. Phased implementation plan

### Phase 0 — Approval and sequencing

- Review this spec with Finn/main session.
- Create Google Doc version after review for M Jones approval.
- Decide whether to land cache/shared-hook refactor first. Recommended: yes.

Definition of done:

- M Jones approves V1 scope and open questions.
- Implementation order is selected.

### Phase 1 — Data/API foundation

- Extend server normalized message shape with reply header fields (`replyToTopId`, `replyQuoteText`) where easy.
- Add resolve-by-ids library function.
- Add resolve API route or `ids` query mode.
- Add validation and tests.

Definition of done:

- Specific Telegram message ids can be fetched read-only for a group chat.
- Invalid ids are rejected.
- Existing list/send/mark-read API behavior remains unchanged.

### Phase 2 — Shared client cache/index support

- Ensure page and widget use the full API-compatible `TelegramMessage` type.
- Add per-chat `messagesById`, reply preview resolution, and `replyChildrenByParentId` indexing to shared hook or interim helpers.
- Batch resolve missing preview targets after message load/poll.

Definition of done:

- Both surfaces can access reply metadata and preview targets.
- Resolved targets are cached per chat and not mixed across chats.

### Phase 3 — Reply preview UI

- Add reusable `TelegramReplyPreview` component.
- Render previews in full page and widget bubbles.
- Add preview click behavior: jump/highlight if loaded; resolve/open thread/fallback otherwise.

Definition of done:

- Replies are visually understandable without opening Telegram.
- Missing targets show graceful fallback.

### Phase 4 — Thread/chain panel

- Add `Thread` action eligibility helper.
- Add full-page side panel and widget compact popout/modal.
- Build parent chain by following cached/resolved `replyToMessageId` links.
- Show known loaded child replies with clear label.

Definition of done:

- M Jones can open a focused reply chain and inspect context.
- Panel handles partial/unavailable chains.

### Phase 5 — Agent reply behavior follow-up

- Inspect current Finn/OpenClaw Telegram group config for `channels.telegram.replyToMode` only with M Jones approval if config changes may be needed.
- If approved, set reply threading policy for Finn group (`first` recommended) or add system-prompt instruction to prefer `[[reply_to_current]]` where appropriate.
- Verify with a controlled manual message only if M Jones approves external Telegram test sends.

Definition of done:

- Current behavior is documented.
- Any config changes are approved and verified separately.

## 15. Open questions for M Jones

1. **Thread panel scope:** For V1, is “parent chain + known loaded replies” acceptable, or do you expect exhaustive child replies even if that requires scanning/fetching more Telegram history?
2. **Click behavior:** Should clicking the inline reply preview primarily jump to the original message when loaded, or always open the focused thread panel?
3. **Panel placement:** In the full page, do you prefer a right-side panel, centered modal, or Telegram-like overlay? Recommendation: right-side panel for full page, modal/bottom sheet for widget.
4. **Agent threading config:** Should Finn always reply to the triggering Telegram message in this group (`replyToMode: first`), or only when explicitly instructed? Recommendation: enable `first` if the group is primarily operational/task conversation.
5. **Fallback wording:** Is “Original message unavailable” acceptable for deleted/media/inaccessible parents, or should we distinguish those cases visibly?
6. **Implementation order:** Should this wait for the shared message-cache hook refactor, or should reply previews be implemented first even if some code is later moved?

## 16. Approval request

Approve the recommended V1 scope:

- Inline Telegram-style reply previews in both full page and widget.
- Read-only resolve-by-message-id API for missing reply targets.
- `Thread` action for messages with parent/known child chain membership.
- Focused thread panel showing parent ancestry and known cached replies, without promising exhaustive child lookup in normal groups.
- Agent reply behavior handled via OpenClaw Telegram reply threading configuration/policy, not by Mission Control rewriting agent sends.

Approval should also confirm the implementation order relative to the existing Telegram message-cache/shared-hook refactor.
