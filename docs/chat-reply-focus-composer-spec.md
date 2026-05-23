# Chat Inbox reply composer focus spec

## Problem

In Mission Control's Telegram Chat Inbox, clicking a message's Reply action sets the reply target but does not reliably place the cursor in the actual message composer. Focus can appear on the reply target preview/box above the composer, leaving M Jones unable to immediately type.

## Intended behavior

When M Jones clicks Reply for a Telegram message, Mission Control should:

1. set the selected reply target to that message;
2. move keyboard focus/cursor to the real composer textarea;
3. allow typing immediately without an extra click.

This applies to the full Chat Inbox page and the compact chat widget, including reply actions from the thread context modal.

## Likely components/files

- `src/components/chat/TelegramChatInboxPage.tsx`
- `src/components/chat/TelegramChatWidgetContent.tsx`
- Existing reply context/composer utilities and tests under `src/components/chat/`

## Implementation approach

- Add a textarea ref for each composer.
- Centralize reply selection through a small handler that sets `replyingTo` and schedules focus on the textarea after React commits the reply preview state.
- Use `requestAnimationFrame` with a short timeout fallback so focus works after preview mount/re-render without focusing the preview itself.
- Reuse the handler for message bubble replies and thread-modal replies.
- Keep cancel, send, thread-close, and chat-switch behavior unchanged.

## Accessibility/focus expectations

- Focus should land on the native `<textarea>`, preserving normal keyboard and screen-reader semantics.
- Reply preview remains visible as contextual state but is not programmatically focused.
- No keyboard trap is introduced; Cancel and Send remain reachable.

## Tests

- Prefer a focused behavior test for the focus helper because the repo's existing Node test setup does not include a browser/React DOM renderer.
- Run the targeted helper test, the existing chat-related tests, typecheck/build or the smallest repo gate available, and `git diff --check`.

## Manual QA/dev preview plan

- Launch a feature dev preview on an available 4010-4040 port, not stable 4000.
- Smoke `/` and `/api/dev-preview-metadata`.
- In Chat Inbox, select a Telegram chat, click Reply on a message, and confirm the reply target appears while the cursor is in the composer and typing begins immediately.

## Non-goals

- No changes to Telegram send semantics, message threading data, read/starred markers, chat filters, styling beyond focus behavior, stable port 4000, or deployment/merge behavior.
