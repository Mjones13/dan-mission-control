# Mission Control clean chat filters + reply jump spec — 2026-05-21

## Source baseline

- Base branch: current `main` at `d5b5f7541bdc1ff9dcacaa5c75fa66d1cbaf6240` (`origin/main` equal after fetch).
- Primary UI file inspected: `src/components/chat/TelegramChatInboxPage.tsx`.
- Existing helper/state files inspected: `telegramChatDisplay.ts`, `useTelegramAgentReadMarkers.ts`, `telegramReplyContext.ts`, `TelegramReplyContextViews.tsx`, `telegramScrollAnchoring.ts`.
- Backend inspected: `src/app/api/telegram/chats/[chatId]/messages/route.ts`, `src/lib/telegram/messages.ts`, and warm-client references. This spec intentionally preserves current `main` warm GramJS client behavior and does not change backend routes/libraries.
- PR #11/#13 and the local 4020 diagnosis are reference only; implementation should be clean against this baseline, not a wholesale copy of conflict-resolved UI chunks.

## Goals

1. Add current-chat message filters: `All`, `Unread`, and `Starred`.
2. Keep local read/unread/needs-attention state separate from Telegram server read state.
3. Keep local starred marker state local and deterministic.
4. Make unread child replies understandable by showing parent context when their parent is loaded/resolved.
5. Add a small down-arrow/newer-reply affordance on loaded messages that have direct child replies.
6. Make child-reply jump behavior deterministic, visible, and non-disruptive to the current `main` scroll anchoring / Jump to latest behavior.
7. Highlight only the target message bubble after a child-reply jump.
8. Preserve current message loading, scroll anchoring, Jump to latest, reply modal, composer, and warm-client backend behavior.

## Non-goals

- No backend Telegram route/library changes unless a hard blocker appears and is explicitly justified.
- No changes to Telegram server read semantics. Existing server `PATCH` mark-read behavior remains separate from local marker filters.
- No dependency/package/tooling changes.
- No broad visual redesign, global chat filtering, search, or persistent server-side marker storage.
- No attempt to implement full threaded/sibling navigation beyond direct child replies among currently loaded messages.

## Current-main behavior to preserve

- `visibleTelegramMessages(messages)` filters stale bridge-status messages while preserving recent status messages.
- `useTelegramAgentReadMarkers` stores local read/starred marker state in localStorage (`mission-control.telegram.agentMessageMarkers.v2`) and migrates v1 read markers.
- `markReplyParentsRead` currently marks incoming parent messages read when outgoing loaded messages directly reply to them. This is local-only marker state.
- Chat selection, older-message loading, appended-message handling, and Jump to latest are controlled by `telegramScrollAnchoring.ts` helpers and refs in `TelegramChatInboxPage.tsx`; new explicit child jumps must not change the automatic anchoring decision tree.
- Reply context helpers can resolve/show parent previews for messages with `replyToMessageId`.

## Proposed model/helper changes

Add pure, tested helper functions near existing chat display/read-marker helpers, likely `src/components/chat/telegramMessageViews.ts`, for UI view derivation:

- `TelegramMessageViewFilter = 'all' | 'unread' | 'starred'`.
- `buildDirectReplyIndex(messages)` returns `Record<number, TelegramMessage[]>` or `Map<number, TelegramMessage[]>` sorted by ascending message id. It only uses currently loaded/renderable messages.
- `firstDirectReplyTarget(parentId, replyIndex)` returns the first direct reply in deterministic ascending id order. If multiple direct replies exist, the returned target is still the earliest loaded child, and the UI label/title must disclose that it is the first of N loaded replies instead of silently implying uniqueness.
- `filterTelegramMessageViews(messages, filter, markerLookup)` applies:
  - `all`: all visible messages.
  - `unread`: incoming messages that are not locally read and are not locally starred. Starred messages are needs-attention and should live under Starred, not disappear into normal unread triage.
  - `starred`: locally starred messages.
- Child-reply context for filtered rows:
  - When a filtered unread/starred row is a child reply (`replyToMessageId`) and the parent is available through existing inline reply context lookup, show the inline parent preview already supported by `TelegramMessageBubble`.
  - If the parent is not resolved/available, keep existing unavailable behavior; do not block rendering.

## UI behavior

### Filter controls

- Show small segmented controls for the selected chat above the message scroll area or at the top of the thread surface.
- Labels: `All`, `Unread`, `Starred`.
- Counts may be shown if cheap from loaded messages; they are counts for loaded/currently visible messages only, not server/global totals.
- Switching filters should not mark messages read and should not call Telegram server read APIs.
- Empty filtered states should be lightweight and explicit, e.g. no loaded unread/starred messages.

### Local markers

- Preserve the existing marker cycle: none → local read → local read + starred → none.
- Local marker UI remains on incoming messages.
- Starred state is local needs-attention state and distinct from Telegram server unread count.

### Direct child reply affordance

- For a loaded message with one or more direct loaded child replies, render a small down-arrow/newer-reply button inside the bubble controls.
- If exactly one child exists: clicking jumps to that child.
- If multiple direct children exist: clicking jumps to the earliest loaded child by ascending message id, and button/title text must disclose the deterministic behavior (for example, “Jump to first of 3 loaded replies”). This avoids a silent confusing branch choice.
- Do not auto-open the modal for this affordance; it is a direct scroll jump in the current message list.

### Jump and highlight

- Jumps should target DOM nodes by message id and use `scrollIntoView({ block: 'center' })` or equivalent so the reply is clearly brought into view.
- Explicit child jumps should be separate from automatic scroll anchoring refs. They should not flip `shouldScrollToBottomRef`, clear unseen-new-message state, or otherwise mutate Jump to latest behavior.
- After jumping, apply a short-lived highlight to the target message bubble only, not the full-width row. Put the highlight class on the bubble wrapper/component, not on the list row.
- Highlight should be local UI state and clear automatically after a short timeout and/or when another child jump happens.

## Integration notes

- Keep backend and warm-client code unchanged.
- Keep comments focused on non-obvious contracts: local-vs-server read semantics, deterministic multiple-child jump behavior, and why explicit child jumps do not touch automatic scroll anchoring refs.
- Implement pure helpers and tests first, then integrate with `TelegramChatInboxPage.tsx`.
- If `ChatWidget` current main supports a compact shared bubble integration cheaply, wire the bubble prop additions so it remains type-compatible; otherwise limit behavior to full `/chat-inbox` and preserve widget behavior.

## Verification plan

- Unit tests for helper/view logic:
  - all/unread/starred filtering with local read/starred markers,
  - starred excludes rows from unread triage,
  - direct child reply index sorted deterministically,
  - multiple child reply target returns earliest child and count metadata,
  - child reply context does not mutate message order.
- Run targeted tests for new helpers and affected existing tests.
- Run `npx tsc --noEmit --pretty false`.
- Run `npm run build` if feasible.
- Start preview on reserved non-4000 port and smoke:
  - `/chat-inbox` returns 200,
  - `/api/telegram/status` OK,
  - `/api/telegram/chats?limit=3` OK,
  - `/api/telegram/chats/-5112572436/messages?limit=10` returns non-empty messages.
