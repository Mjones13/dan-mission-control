# Telegram Agent Read Markers Lightweight Spec

## Status

- Owner: M Jones
- Draft owner: Finn
- Date: 2026-05-19
- Status: Approved lightweight implementation spec
- Scope: Mission Control Telegram Chat Inbox full page + floating widget local UI markers

## Goal

Let M Jones manually mark incoming agent/Finn messages as read/handled in Mission Control, with a visible checkmark that persists across chat switches and page reloads.

This is separate from Telegram server read state and Telegram unread counts. It is a personal local processing marker for M Jones.

## Scope

- Apply to incoming/non-outgoing messages only for V1.
- Do not show the marker button on M Jones's own outgoing messages.
- Store state locally in browser `localStorage`.
- Do not add database schema, Telegram API, or server persistence.
- Cap stored markers per chat to the most recent 100 marked message IDs.
- Implement in both standalone `/chat-inbox` and floating widget.

## User-visible behavior

- Each incoming message bubble has a small read-marker control in the bottom action row near `Reply` and future `Thread`.
- Unmarked state: subtle button such as `Mark read` or an outline/check icon.
- Marked state: visible white checkmark / `✓ read`.
- Clicking toggles the marker for that message.
- Marked state remains after switching chats.
- Marked state remains after page reload.
- The marker does not affect Telegram read/unread counts.

## Storage

Use one versioned localStorage key:

```text
mission-control.telegram.agentReadMarkers.v1
```

Suggested JSON shape:

```json
{
  "-5112572436": [3065, 3066, 3072],
  "-5015476421": [1201, 1208]
}
```

Presence in the chat array means read/handled. No explicit `false` values are needed.

## Retention

For each chat id:

1. On mark/read:
   - dedupe the message id,
   - append it to the end of that chat's array,
   - if length exceeds 100, drop oldest ids from the front.
2. On unmark:
   - remove the message id from that chat's array.
3. Ignore malformed localStorage content by resetting to an empty object.

## Implementation guidance

Prefer a tiny shared helper or hook so full page and widget do not duplicate localStorage parsing/capping logic.

Suggested helper path:

```text
src/components/chat/useTelegramAgentReadMarkers.ts
```

Possible API:

```ts
const { isMarkedRead, toggleReadMarker } = useTelegramAgentReadMarkers();
```

or:

```ts
const readMarkers = useTelegramAgentReadMarkers(selectedChatId);
readMarkers.isMarked(message.id);
readMarkers.toggle(message.id);
```

If the shared chat-cache hook is already implemented, keep this feature separate but compatible; it may be used from the message bubble render layer rather than becoming core Telegram cache state.

## Eligibility

V1 eligibility:

```ts
const canShowReadMarker = !message.isOutgoing;
```

Future refinement:

- Restrict to known agent sender IDs only if non-agent group participants make this noisy.
- Known IDs from current context: Finn, Jace, Leo agent/bot IDs.

## Acceptance criteria

- Given an incoming Finn/agent message, when M Jones clicks the read-marker button, the message shows a visible read/check state.
- Given a marked message, when M Jones switches chats and returns, the check remains.
- Given a marked message, when M Jones reloads `/chat-inbox`, the check remains.
- Given an outgoing M Jones message, no read-marker button appears.
- Given more than 100 marked message IDs in one chat, the oldest stored IDs are trimmed and the newest 100 remain.
- Telegram unread counts and server read state are unchanged.

## Verification plan

- Add focused unit tests for localStorage helper/capping if practical.
- Run TypeScript check.
- Run `git diff --check`.
- Smoke `/chat-inbox` on local dev server if available.
- Manual browser QA: mark/unmark, switch chats, reload page, confirm outgoing messages have no marker.

## Caveats

- localStorage is browser/device-specific. Markers will not sync across browsers/devices in V1.
- Markers may disappear if browser storage is cleared.
- This is not an acknowledgment sent to Telegram or agents.
