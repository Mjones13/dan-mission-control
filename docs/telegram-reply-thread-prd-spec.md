# Telegram Reply Previews + Reply-Chain Viewer PRD / Engineering Spec

## Status

- **Owner:** M Jones
- **Draft owner:** Finn research subagent; updated by Finn implementation-planning subagent
- **Date:** 2026-05-19; updated 2026-05-20
- **Status:** Approved practical V1 scope from M Jones; implementation-ready after active branch collision is clear
- **Scope:** Mission Control Telegram Chat Inbox full page + widget reply visibility, inline reply previews, centered thread/context modal, bounded parent-chain loading, and related Telegram/OpenClaw reply behavior
- **Google Doc:** https://docs.google.com/document/d/1Up_QqStF9QXTsml2GjHmW_B36VzYnVTdtsMFQ8QQHY0/edit?usp=drivesdk
- **Sync note:** This local source has been updated with M Jones's 2026-05-20 V1 decisions. The Google Doc still needs a content sync; `gog docs` can export/cat but does not support in-place edits in the available CLI path.

## 1. Executive summary

Mission Control already preserves the raw Telegram reply target id for fetched text messages (`replyToMessageId`) and already sends manual Mission Control replies with GramJS `sendMessage(..., { replyTo })`. However, the UI does not render Telegram-style reply previews, the widget type currently omits reply metadata, and there is no way to inspect the local reply chain/history from Mission Control.

Recommended V1:

1. **Render reply previews inline on message bubbles** whenever `replyToMessageId` exists.
2. **Resolve missing reply targets on demand** with `client.getMessages(dialog.inputEntity, { ids: [...] })`, exposed through a bounded API path, rather than requiring the target to already be in the visible window.
3. **Add a `Thread` action** next to/near the existing `Reply` action for messages that either reply to another message or have known cached replies.
4. **Open a centered thread/context modal** showing the selected message's parent ancestry plus the selected message. The modal is scrollable, roughly 90% of the normal chat-screen real estate, and V1 loads context upward rather than attempting exhaustive child replies downward.
5. **Keep Telegram as source of truth** and store only bounded, in-memory/session reply metadata unless the broader cache refactor later introduces a shared hook. Parent lookups remain bounded and on demand; no full durable mirror.
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
5. Provide a focused centered modal that shows relevant reply-chain context without leaving the current chat.
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

Conclusion: `messages.getReplies` is useful for Telegram discussion/comment/forum-like thread contexts but **should not be assumed to work as a universal child-reply lookup for ordinary group replies**. For Mission Control's V1 group-chat inbox, build parent ancestry by following `replyToMessageId` links. Do not load exhaustive child replies downward in V1; a later enhancement can revisit `GetReplies` only after a chat-type capability check.

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
   - If not loaded, attempt bounded target resolve; then open the thread/context modal anchored to the selected message/target rather than silently doing nothing.
   - If resolve fails, show non-blocking unavailable state.
6. The widget must not regress its compactness; previews can use smaller text and fewer details.

### Thread button requirements

1. Add `Thread` action styled similarly to `Reply`, near the existing `Reply` action or lower corner of the bubble.
2. Show `Thread` when:
   - message has `replyToMessageId`, or
   - any loaded/cached message in the same chat has `replyToMessageId === message.id`, or
   - message has richer reply/thread metadata (`replyToTopId`, forum topic/thread marker) once exposed.
3. Do not show `Thread` on every message in V1 if there is no known chain membership; avoid visual noise.
4. If a user opens a thread for a message with unknown/missing ancestors, the modal should explain “Some earlier messages could not be loaded” rather than failing.

### Thread/context modal requirements

1. Clicking `Thread` opens a centered modal/context viewer, not a side panel.
2. The modal should take roughly 90% of the same real estate the normal chat screen would take, while still making the backdrop/page relationship clear.
3. The modal shows only the selected reply chain/context, not the whole chat.
4. The modal is scrollable like normal chat and focused for reading.
5. The modal supports close/back. Clicking the normal page/backdrop outside the modal closes it.
6. Clicking or focusing the parent-page composer/textbox behind or near the modal must **not** close the modal, so M Jones can type while looking at the context.
7. Each message row in the modal should preserve basic sender/time/body and reply preview context.
8. V1 loads parent ancestry/context upward, not exhaustive child replies downward.

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
- Thread context is often incomplete.
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
6. Thread/context modal shows the bounded **parent chain** oldest resolved ancestor → ... → selected message.
7. Default chain load is up to 5 messages in the parent chain. If only 2–3 are locally cached, repeatedly fetch the parent of the oldest known chain message until 5 are loaded or there is no parent.
8. The modal includes a `Load earlier in chain` / `Load more context` affordance that fetches another batch of up to 5 ancestors using the same bounded parent-following algorithm.
9. Do not promise exhaustive child replies in V1. Cached child indicators may still make a message eligible for `Thread`, but the context view is parent-ancestry-first and must not imply complete downward discovery.
10. Agent reply behavior remains an OpenClaw policy/config concern; Mission Control displays reply chains produced by Telegram metadata.

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
2. If target id exists in cache but not mounted due to view/filter state: open the thread/context modal with that target context.
3. If target id is not cached: call resolve-by-ids endpoint, cache result, then open the thread/context modal or jump if the message is in current rendered range.
4. If target cannot be loaded: keep fallback state; clicking opens the thread/context modal with an unavailable parent row.

Avoid auto-loading arbitrary older pages to find a parent; use id fetch instead.

## 9. Thread/chain viewer design

### V1 content model

For a selected message `M`:

1. Walk parent ancestry upward:
   - start at `M`, follow `replyToMessageId`, fetch missing parent by id if needed,
   - stop when no parent, parent unavailable, batch/depth limit reached, or cycle detected.
2. Reverse ancestry for display oldest → newest.
3. Include selected message and label/anchor it.
4. Do **not** attempt exhaustive child-reply loading downward in V1.

Default and incremental load behavior:

- Initial modal load: up to 5 messages in the parent chain, including the selected message.
- If only 2–3 are locally cached, repeatedly fetch the parent of the oldest known chain message until 5 messages are loaded or the chain terminates.
- `Load earlier in chain` / `Load more context`: fetch another batch of up to 5 ancestors using the same algorithm.
- Absolute safety cap: 20 parent-chain messages per open modal session unless explicitly raised later.
- Since each parent id is discovered from the fetched parent, ancestry fetches are naturally iterative; avoid tight loops and cache failures.

### Thread/context modal UI states

- Closed.
- Opening/loading chain.
- Loaded with chain.
- Partial with unavailable ancestors.
- Error with retry.

Modal header:

- Chat title.
- “Reply thread” title.
- Close button.
- Optional “Open in Telegram” only if Mission Control later has deep links; out of scope for V1.

Modal row actions:

- Reply: sets the parent-page composer reply target to that row's message. Prefer keeping the modal open while M Jones types; fallback close behavior is acceptable only if documented as the simpler V1 tradeoff.
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
6. **No automatic sends from Mission Control UI.** Browsing/reply previews/thread context modal should not dispatch agent work.

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
12. **Widget compact layout:** preview/thread context modal must not overflow or make the composer unusable.
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
5. Clicking preview for missing target invokes resolver and opens the thread/context modal on success/fallback.
6. Thread/context modal displays parent chain in chronological order.
7. `Load earlier in chain` / `Load more context` fetches the next bounded batch of up to 5 ancestors.
8. Clicking/focusing the parent-page composer while the modal is open does not close the modal.
9. Reply from a modal row sets the parent-page composer reply target.
10. Widget uses full message type and renders compact preview without layout break.

### Manual QA scenarios

Given a Telegram group with message A and reply B:

- When B is in the latest window and A is in the latest window, B shows a preview of A.
- When B is in the latest window and A is older than loaded history, B initially shows resolving/fallback then displays A after id resolution.
- When M Jones clicks B's `Thread`, the centered modal shows A → B.
- When B has more than five ancestors, the modal initially shows the nearest five-message chain context and `Load earlier in chain` loads more parent ancestry.
- When another loaded message C replies to B, B may be eligible for `Thread`, but the modal remains parent-ancestry-first and does not imply exhaustive child replies downward.
- When A is deleted or inaccessible, B shows an unavailable preview and the modal still opens with B.
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

- M Jones approved the practical V1 direction on 2026-05-20.
- Local source updated with latest decisions.
- Google Doc exists but still needs sync from this local source because the available `gog docs` CLI path supports export/cat/copy, not in-place editing.
- Implementation should be sequenced after active overlapping chat-component work is clear. At update time, PR #5 `finn/mc-telegram-polling-policy` is open and `finn/mc-sent-message-swoosh` has an active worktree touching the same chat components.

Definition of done:

- Local plan reflects approved V1 decisions.
- Implementation branch order is selected; recommended branch order is PR #5 → sent-message swoosh → reply/thread context modal, unless swoosh is abandoned or merged differently.

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

### Phase 4 — Thread/context modal

- Add `Thread` action eligibility helper.
- Add centered modal/context viewer for full page and widget contexts instead of a side panel.
- Size the modal to roughly 90% of the normal chat-screen real estate and make its contents scroll like normal chat.
- Build parent chain by following cached/resolved `replyToMessageId` links upward.
- Initial load fetches up to 5 chain messages; `Load earlier in chain` / `Load more context` fetches another batch of up to 5 ancestors.
- Reuse the parent-page composer/textbox rather than duplicating the composer inside the modal unless duplication is clearly simpler and low-risk.
- Backdrop/page click closes the modal, but clicking/focusing the main composer must not close it.
- Reply from a modal row sets the parent-page composer reply target. Prefer keeping the modal open while typing; if this proves disproportionately complex, document the fallback before using it.
- Do not load exhaustive child replies downward in V1.

Definition of done:

- M Jones can open a focused reply-chain context modal and inspect parent ancestry.
- Modal handles partial/unavailable chains and incremental earlier-context loading.
- Composer interaction while viewing context works without accidental modal close.

### Phase 5 — Agent reply behavior follow-up

- Inspect current Finn/OpenClaw Telegram group config for `channels.telegram.replyToMode` only with M Jones approval if config changes may be needed.
- If approved, set reply threading policy for Finn group (`first` recommended) or add system-prompt instruction to prefer `[[reply_to_current]]` where appropriate.
- Verify with a controlled manual message only if M Jones approves external Telegram test sends.

Definition of done:

- Current behavior is documented.
- Any config changes are approved and verified separately.

## 15. Current decisions and remaining follow-ups

### Decisions from M Jones, 2026-05-20

1. Regular chat view must show Telegram-style inline reply preview indicators/bubbles for reply messages.
2. Thread/context view is a centered modal, not a side panel.
3. The modal should occupy about 90% of the normal chat-screen real estate and be scrollable like normal chat.
4. V1 loads parent ancestry/context upward, not exhaustive child replies downward.
5. Default chain load is up to 5 messages; if only 2–3 are cached, fetch parents iteratively until 5 are loaded or the chain terminates.
6. Add `Load earlier in chain` / `Load more context` to fetch another batch of up to 5 ancestors.
7. Composer means the text box / message input. Prefer reusing the parent-page composer rather than duplicating it in the modal.
8. Backdrop clicks close the modal, but clicking/focusing the main composer while the modal is open should not close it.
9. Reply from the modal should set the parent-page composer reply target. Prefer keeping the modal open while typing; fallback is acceptable only if keep-open behavior is disproportionately complex.
10. Keep Telegram as source of truth; no full durable mirror; parent lookups are bounded.

### Remaining follow-ups

1. **Agent threading config:** Should Finn always reply to the triggering Telegram message in this group (`replyToMode: first`), or only when explicitly instructed? Recommendation: handle separately; do not block Mission Control UI V1.
2. **Fallback wording polish:** Default to specific fallback states (`deleted`, `non_text`, `inaccessible`, `error`) in code where known, with “Original message unavailable” as the generic UI fallback.
3. **Implementation sequencing:** Avoid collisions with active PR #5 and the sent-message swoosh branch; stack reply/thread work after the branch that owns the latest chat hook/widget changes.

## 16. Approval request

Approved practical V1 scope to implement when branch sequencing is safe:

- Inline Telegram-style reply previews in both full page and widget.
- Read-only resolve-by-message-id API for missing reply targets.
- `Thread` action for messages with parent/known chain membership.
- Centered thread/context modal showing bounded parent ancestry upward.
- Initial parent-chain load up to 5 messages plus `Load earlier in chain` / `Load more context` batches of 5.
- Reuse parent-page composer/textbox where practical; modal should remain open while typing if clean.
- No exhaustive child lookup, no full durable Telegram mirror, no Mission Control rewriting of agent sends.
