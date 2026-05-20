# Telegram Chat Inbox PRD + Implementation Plan

## Status

- Owner: M Jones
- Draft owner: Finn
- Status: Draft for grilling/review
- Scope: Mission Control local UI + Telegram account client + task capture integration
- Non-goal for V1: Jira/external tracker integration

## 1. Problem

Mission Control currently has task orchestration and task chat, but it does not function as a Telegram client. M Jones wants to use Mission Control as a focused operating console where Telegram conversations with OpenClaw agents/bots can be browsed, replied to, referenced, and converted into local Mission Control tasks.

The current OpenClaw Telegram integration is bot-based. It supports bot DMs/groups and routed inbound/outbound messages, but it does not provide full access to all Telegram account dialogs/history. A full Telegram inbox requires a Telegram user-client layer using Telegram MTProto, with OpenClaw bot messaging remaining useful for agent/bot routing.

## 2. Goals

1. Show M Jones's Telegram chats in Mission Control.
2. Let M Jones click between chats and view message history with scrollback.
3. Let M Jones send replies from their own Telegram account.
4. Reuse/take over Mission Control's existing Chat Inbox surface for this Telegram inbox experience.
5. Also provide a standalone page that shows only the Telegram chat UI.
6. Support task capture from Telegram messages and chats.
7. Keep all data local by default.
8. Avoid Jira/external integration for this scope.
9. Keep agent automation opt-in; browsing/replying should not automatically dispatch work.

## 3. Non-Goals

- Public internet deployment.
- Replacing the official Telegram app completely in V1.
- Syncing every Telegram feature on day one: calls, stories, payments, secret chats, reactions edge cases, full admin tools, etc.
- Automated replies from agents without explicit user intent.
- Jira sync.

## 4. Primary User Experience

### 4.1 Chat Inbox takeover

Mission Control's Chat Inbox should become the main Telegram conversation inbox.

Expected layout behavior:

- The default/small Chat Inbox should be single-pane, not split into two columns.
- In the small/default mode, the first view is the chat list: Telegram chats/groups/conversations.
- Clicking a chat replaces the list with that chat's message thread.
- While viewing a selected chat in small/default mode, the full chat list is not visible.
- A top-left back button returns from the message thread to the chat list.
- The selected chat thread includes the composer for sending messages as M Jones.
- The Chat Inbox should include an expand/enlarge control.
- In expanded mode, the chat box should take over a substantial portion of the screen, roughly 2/3 to 80% of the browser width.
- Only in this expanded/larger mode should the UI use split-pane layout: chat list/groups/conversations on the left and selected chat messages on the right.
- Message actions: reply, copy, create task, link to task, summarize/reference.
- Optional right panel or drawer: linked Mission Control tasks and context. This should not crowd the small/default single-pane mode.

Resize behavior for the overlay:

- The existing Chat Inbox overlay already has an enlarge/resize button.
- That button should make the overlay substantially larger, not just slightly wider.
- Target enlarged size: roughly double the default width and about 50% taller than the default height, constrained by viewport bounds.
- In practical terms, when browser space allows, the enlarged overlay should feel substantial enough for split-pane use, approximately 2/3 to 80% of available browser width.
- The enlarged overlay is where split-pane list + selected chat layout is allowed.

### 4.2 Standalone chat page

Add a page for only the chat UI, separate from workspace dashboards/activity views.

Chosen route:

- `/chat-inbox`

The standalone page should show the full Chat Inbox experience as a normal page, not as an overlay floating over another Mission Control page.

Overlay/header navigation behavior:

- The existing small Chat Inbox overlay has a header/title area that says `Chat Inbox` with a folder-style icon.
- That `Chat Inbox` title/header text should become clickable.
- Clicking the title/header opens the standalone `/chat-inbox` page.
- Do not add a separate redundant button if the title/header affordance is clear.

### 4.3 Conversation switching

M Jones should be able to:

- see recent Telegram group chats,
- search/filter group chats,
- click a chat,
- see its history,
- scroll upward for older messages,
- send a new message,
- reply to a specific message.

The small/default Chat Inbox should remember the last opened chat. If a last-opened chat exists and is still available, reopening the Chat Inbox should return to that chat rather than always returning to the chat list.

### 4.4 Intended first chat set

V1 should include only Telegram group chats. M Jones expects the relevant OpenClaw bot conversations to happen in group chats, not separate bot DMs, so DMs/private chats/channels are out of scope for V1 unless added later.

Messages sent from the UI should come from M Jones's Telegram account, not from an agent bot, unless explicitly configured otherwise.

## 5. Key Product Decisions

1. Sync scope:
   - Decision: V1 syncs/displays Telegram group chats only.
   - Rationale: M Jones expects the bot/agent conversations to live in group chats.
   - Out of scope for V1 unless explicitly added: direct/private chats, channels, archived non-group dialogs.

2. Send identity:
   - Decision: messages should come from M Jones's Telegram account.
   - This requires Telegram user-client auth, not bot-only send.

3. History depth and scrollback:
   - Decision: initial load should fetch recent 50 messages per opened chat.
   - Older messages should lazy-load in additional batches, e.g. 50 at a time, when M Jones scrolls upward.
   - If lazy-loading becomes unexpectedly complex or unreliable, fallback is to keep V1 at recent 50 and use the official Telegram app for deeper history until the scrollback path is hardened.

4. Storage/cache:
   - Decision: Telegram remains the source of truth. Do not build a full durable local mirror of all message bodies for V1.
   - Use a small local cache only where it improves responsiveness, e.g. recent messages for currently/recently opened group chats.
   - Recommended V1 cache policy: cache recent 50 messages per opened group chat, optionally up to 100 after scrollback, with clear retention limits.
   - Store durable metadata needed for navigation/linking, such as group chat id/title, last-opened chat, cursors, and task links.
   - Do not durably store raw inbound message text as a hidden side effect.
   - If M Jones asks an agent to create a task from a message/request, the agent should infer an appropriate task title, description, instructions, status/stage, and any relevant subagent/delegation notes from M Jones's actual instructions and the immediate request context.
   - Task creation may include the relevant user-provided instruction text as normal Mission Control task content when needed to make the task actionable, but should not create a broad hidden archive of unrelated Telegram message history.
   - A source reference may store Telegram chat/message ids for traceability where useful.
   - V1 media decision: text-only first. Images/files are not fetched/cached in Mission Control V1; use official Telegram for media-heavy review.

5. API cost and limits:
   - Telegram MTProto/API usage does not have a normal per-call billing cost for this use case.
   - Telegram does enforce rate limits/flood waits and account-safety heuristics. Implementation must respect returned wait errors, avoid aggressive polling/backfill, and use incremental sync/lazy loading.

6. Privacy model:
   - Mission Control is LAN-visible today. Telegram messages are sensitive.
   - Need local auth/access control before enabling personal Telegram account browsing.

## 6. Security Requirements

Telegram user-client auth creates a logged-in Telegram session. Treat it like a high-value credential.

Requirements:

- Store Telegram session/auth material server-side only.
- Never send session strings/auth keys to the browser.
- Encrypt at rest, preferably via macOS Keychain or equivalent local secret store.
- Add a clear disconnect/revoke flow that deletes local session data.
- Require Mission Control authentication before viewing Telegram chats.
- Keep the app local/LAN-only unless a separate security review approves exposure.
- Audit outbound sends: who/what sent, destination chat, timestamp, message id.
- Default to human-controlled sending; no automatic agent sends as M Jones.
- Avoid storing secrets in task descriptions or activity logs.

## 7. Known Technical Pattern

This is a known pattern, not net-new:

- Telegram official web clients use MTProto-backed web-client architecture.
- GramJS provides a Node/browser MTProto Telegram client.
- Telethon provides a Python MTProto Telegram client.

However, embedding a personal Telegram account into a private local dashboard is security-sensitive. It should be built like a private Telegram client, not like a normal bot integration.

## 8. Architecture

### 8.1 Layers

1. Mission Control UI
   - Chat list
   - Thread viewer
   - Composer
   - Task actions

2. Mission Control API
   - Chat listing API
   - Message history API
   - Send/reply API
   - Sync/backfill API
   - Task link API

3. Telegram user-client service
   - MTProto session management
   - Dialog listing
   - Message history fetch
   - Update listener
   - Send/reply calls

4. Local database / cache
   - group chat metadata
   - last-opened chat preference
   - sync/backfill cursors
   - small bounded recent-message cache, not a full durable mirror
   - outbound send audit records, without storing inbound message archives
   - message-task links

5. OpenClaw bot layer
   - Existing bot-based inbound/outbound agent chat behavior
   - Optional source for OpenClaw bot messages/events

### 8.2 Recommended implementation choice

Use a server-side Telegram client library only.

Likely candidates:

- GramJS in Node/TypeScript: fits current Next/Node app, fewer runtime boundaries.
- Telethon in Python: mature, but requires a sidecar process and bridge API.

Recommendation for Mission Control: start with GramJS unless a proof-of-concept exposes reliability issues.

## 9. Proposed Database / Cache Schema

### `telegram_accounts`

- `id`
- `label`
- `phone_hint`
- `session_secret_ref`
- `status`
- `last_connected_at`
- `created_at`
- `updated_at`

### `telegram_chats`

- `id`
- `account_id`
- `telegram_chat_id`
- `access_hash`
- `type` (`user`, `group`, `supergroup`, `channel`, `bot`)
- `title`
- `username`
- `photo_ref`
- `unread_count`
- `is_pinned` (not used for V1 sorting)
- `is_archived` (not used for V1 filtering)
- `last_message_id`
- `last_message_at`
- `last_synced_at`

### `telegram_message_cache`

Bounded cache only; Telegram remains source of truth.

- `id`
- `account_id`
- `chat_id`
- `telegram_message_id`
- `sender_id`
- `sender_name`
- `direction` (`inbound`, `outbound`)
- `text`
- `reply_to_message_id`
- `sent_at`
- `edited_at`
- `cached_at`
- `expires_at` or cache-pruning policy fields

V1 should not store media bodies or full raw Telegram JSON.

### `telegram_sync_state`

- `account_id`
- `chat_id`
- `oldest_loaded_message_id`
- `newest_loaded_message_id`
- `last_update_pts` / cursor fields as needed
- `backfill_status`

### `telegram_message_task_links`

- `id`
- `telegram_message_id`
- `task_id`
- optional `message_excerpt` only if explicitly included in the task content by M Jones; otherwise store reference ids only
- `link_type` (`source`, `reference`, `followup`)
- `created_at`

## 10. API Endpoints

### Auth/session

- `GET /api/telegram/status`
- `POST /api/telegram/login/start`
- `POST /api/telegram/login/code`
- `POST /api/telegram/login/password` if 2FA required
- `POST /api/telegram/logout`

### Chats/messages

- `GET /api/telegram/chats?query=&limit=&cursor=`
- `GET /api/telegram/chats/:chatId/messages?before=&after=&limit=`
- `POST /api/telegram/chats/:chatId/sync`
- `POST /api/telegram/chats/:chatId/send`
- `POST /api/telegram/chats/:chatId/reply`
- `POST /api/telegram/chats/:chatId/read`

### Task integration

- `POST /api/telegram/messages/:messageId/create-task`
- `POST /api/telegram/messages/:messageId/link-task`
- `GET /api/tasks/:taskId/telegram-links`

## 11. Task Capture Behavior

A separate shared skill should drive task capture so agents do not improvise ad hoc behavior.

Current skill draft:

`/Users/mjones/.openclaw/shared/skills/mission-control-task-capture/SKILL.md`

Expected behavior:

- Task-like chat request -> create local Mission Control task.
- Choose stage intentionally:
  - `planning` for design/spec/ambiguous work,
  - `inbox` for clear queued work,
  - `assigned` only when explicit dispatch/pickup is intended,
  - `done` only with completion evidence.
- Link Telegram message/thread to task when applicable.
- No Jira by default.

## 12. Implementation Plan

### Phase 0 — Product/security decisions

- Confirm local auth requirements for Mission Control before Telegram access.
- Confirm preferred route/UI placement.
- Confirm media handling for V1.
- Confirm agent draft/send boundaries.

Already decided:

- V1 sync scope: Telegram group chats only.
- Send identity: M Jones's Telegram account.
- Default/small inbox reopen behavior: remember last opened chat.
- Initial history depth: recent 50 messages per opened chat.
- Scrollback: lazy-load older messages in batches when scrolling upward.
- Storage/cache: Telegram remains source of truth; use only bounded local cache/metadata, not a full message mirror.
- Media: text-only for V1.

### Phase 1 — Read-only Telegram proof of concept

- Add dependency and minimal Telegram client wrapper.
- Implement login flow locally.
- Store session securely server-side.
- List group dialogs/chats only.
- Fetch recent 50 messages for selected/opened group chat.
- No sending yet.

Acceptance:

- M Jones can login/connect Telegram locally.
- UI/API can list Telegram group chats.
- UI/API can fetch and display recent 50 messages for one group chat.
- Session is not exposed to frontend.

### Phase 2 — Local metadata/cache model + sync

- Add database migrations for Telegram account/group-chat metadata, bounded message cache, sync cursors, send audit, and task-link tables.
- Persist group chat list metadata and last-opened chat preference.
- Cache only bounded recent text messages for opened/recently opened group chats.
- Implement lazy backfill on scroll, fetching older messages from Telegram and optionally caching the current scroll window.
- Implement update listener or modest periodic sync for new text messages.

Acceptance:

- Group chats load quickly from local metadata.
- Selected chat can fetch recent messages from cache/API as needed.
- Selected chat can scroll backward for older text messages where supported.
- New messages appear without full page refresh or after a short poll.
- Local storage does not become a full durable Telegram message mirror.

### Phase 3 — Chat Inbox UI takeover

- Replace or extend existing Chat Inbox surface with Telegram chat list/thread/composer shell.
- Add standalone focused route.
- Add workspace/default navigation link.
- Add search and unread indicators.
- Sort group chats by most recent message/activity first.

Acceptance:

- M Jones can switch between chats and browse history from the UI.
- The page can be used independently from workspace dashboard/activity pages.

### Phase 4 — Sending and reply behavior

- Implement send-as-M-Jones endpoint.
- Implement reply-to-message endpoint.
- Store minimal outbound send audit metadata.
- Add optimistic UI with reconciliation to Telegram message ids.

Acceptance:

- M Jones can send a message from Mission Control and see it in Telegram.
- M Jones can reply to a specific message.
- Sends are logged and recover cleanly on failure.

### Phase 5 — Task integration

- Add create-task-from-message action.
- Add link-message-to-existing-task action.
- Show linked tasks in chat UI.
- Use shared task-capture skill behavior for status selection.

Acceptance:

- A Telegram message can become a Mission Control task with source metadata.
- A task can show linked Telegram source messages.
- Captured tasks start in the correct stage.

### Phase 6 — Hardening and polish

- Media handling if approved later.
- Rate-limit/retry handling.
- Disconnect/revoke flow.
- Error states and reauth flow.
- Access controls and local auth checks.
- Tests for sync, sends, task capture, and UI flows.

## 13. Risks

- Telegram session compromise would allow account-level read/send access.
- Telegram API/rate limits and update semantics can be complex.
- Full fidelity Telegram UI is large; V1 must stay narrow.
- Secret chats may not be available through normal cloud history APIs.
- Media sync can become storage-heavy.
- LAN-visible Mission Control needs auth before personal chat browsing.

## 14. Grill Session Decisions and Remaining Questions

Decided:

1. V1 sync scope: Telegram group chats only.
2. Relevant chats: group chats where M Jones messages OpenClaw bots/agents.
3. Default/small inbox behavior: remember last opened chat.
4. Initial history: recent 50 messages.
5. Storage/cache: Telegram remains source of truth; Mission Control uses bounded local cache/metadata, not a full durable local message mirror.
6. Media: text-only for V1; use official Telegram for images/files.
7. Scrollback: lazy-load older messages in batches on upward scroll if feasible; fallback to official Telegram for deep history if lazy scrollback becomes unreliable.
8. Security/access: LAN-only with no extra Mission Control login is acceptable for V1; auth remains future hardening.
9. Agent reply drafting: excluded. M Jones writes messages directly.
10. Agent auto-send as M Jones: excluded.
11. Task creation from messages: agents should create well-formed tasks from M Jones's actual request/context, including title, details, planning notes, and subagent/delegation instructions where M Jones provided them. Do not include unrelated chat history.
12. Telegram edits/deletes: M Jones does not expect to edit/delete Telegram messages; V1 does not need special edit/delete reconciliation beyond normal cache refresh.
13. Chat list display: show all Telegram group chats plainly, sorted by most recent message/activity first. Do not mirror archived/muted/pinned state in V1.
14. Minimum useful V1 confirmed: group chat list, remembered last chat, recent 50 text messages, lazy older-message loading, manual send/reply as M Jones, and create Mission Control task from message/request.
15. Standalone route: `/chat-inbox`.
16. Existing overlay title/header behavior: clicking the `Chat Inbox` title/header should open the standalone `/chat-inbox` page.
17. Existing overlay resize button should substantially enlarge the chat box: about double width and 50% taller, constrained by viewport; in enlarged mode, split-pane layout is allowed.

Remaining questions:

None blocking from the product grill so far.

## 15. Recommended V1 Definition

Build a local, read-first Telegram group-chat inbox using M Jones's Telegram account, then add send/reply and task capture.

V1 should include:

- Secure Telegram account login/session storage.
- Telegram group chat list only.
- Initial recent 50 messages per opened chat.
- Bounded local cache/metadata only; Telegram remains source of truth.
- Text-only messages for V1; no media caching.
- Lazy scrollback/backfill in batches where reliable.
- Remember last opened chat in the small/default inbox.
- Send and reply as M Jones, only from direct manual user action.
- Create/link Mission Control tasks from messages using the agent's judgment to convert M Jones's actual request/context into a well-formed task.
- Standalone `/chat-inbox` page plus Chat Inbox overlay takeover.
- Clickable Chat Inbox overlay title/header that opens `/chat-inbox`.
- Existing overlay resize button enlarged to roughly double width and 50% taller, constrained by viewport.

V1 should exclude:

- Public exposure.
- Jira sync.
- Agent-drafted replies.
- Autonomous agent sends as M Jones.
- Media display/caching in V1.
- Direct/private Telegram chats and non-group channels.

## 16. Delegation Plan

This work should be split into bounded implementation lanes, with one owner integrating and verifying the final behavior.

Recommended lanes:

1. Telegram client/auth lane
   - Prove GramJS/MTProto login with M Jones's Telegram account.
   - Require `api_id` and `api_hash` from `my.telegram.org` plus a one-time Telegram login code during setup.
   - Store session material server-side only.
   - List group chats only.
   - Fetch recent 50 text messages for a selected group chat.
   - Implement flood-wait/rate-limit handling.

2. Mission Control API/cache lane
   - Add metadata/cache schema for Telegram account, group chat metadata, bounded message cache, cursors, outbound send audit, and task links.
   - Keep Telegram as source of truth; do not build a full durable message mirror.
   - Implement APIs for group chat list, message fetch/backfill, send, reply, and task creation/linking.
   - Enforce V1 text-only behavior.

3. Chat Inbox UI lane
   - Rework existing Chat Inbox overlay for responsive single-pane vs enlarged split-pane behavior.
   - Make the `Chat Inbox` title/header clickable and route to `/chat-inbox`.
   - Adjust existing enlarge button to make the overlay about double width and 50% taller, constrained by viewport.
   - Implement remembered last-opened chat and most-recent-activity group sorting.

4. Task capture lane
   - Wire create-task-from-message/request using the shared Mission Control task-capture skill.
   - Agent should infer a well-formed task from M Jones's actual request/context.
   - Avoid unrelated Telegram history archival.
   - Put tasks in the correct stage and attach traceable source metadata when useful.

5. Integration/verification owner
   - Own end-to-end test scenarios, risk review, and final PR/spec sync.
   - Verify Telegram auth/session handling, rate-limit behavior, UI resizing, manual sends/replies, and task creation.

Do not start implementation until M Jones approves the PRD/plan and completes the manual Telegram credential/login prerequisites.

## 17. Telegram API Credentials, Rate Limits, and Manual Blockers

Credentials/manual setup required:

- M Jones will need to create or provide a Telegram `api_id` and `api_hash` from `https://my.telegram.org/apps` for the MTProto user-client integration.
- During first local setup, M Jones will need to complete Telegram account login: phone number, Telegram login code, and 2FA password if enabled.
- The `api_hash` and resulting Telegram session must be treated like secrets. They should not be pasted into task text, PRDs, logs, or chat messages. Store via environment/secrets/local secure storage.

Rate limits:

- Telegram does not publish one simple universal MTProto request-per-second limit for this use case.
- Telegram returns wait-style errors such as `FLOOD_WAIT_%d` when an action must be delayed; the client must obey the returned wait duration.
- Chat slow mode can return `SLOWMODE_WAIT_%d` for sends in specific chats.
- V1 should avoid aggressive polling and large backfills: fetch recent 50 on open, lazy-load older batches only on upward scroll, and prefer update listeners or modest polling for new messages.
- There is no normal per-call billing cost expected for MTProto API use; the risk is throttling/account-safety limits, not usage fees.

Likely blockers before implementation:

- Telegram `api_id` / `api_hash` must be available.
- M Jones must be available for first login code / 2FA during setup.
- Implementation may need approval to add a Telegram client dependency such as GramJS.
- A local secret/session storage choice must be confirmed before storing Telegram session material.
- If Telegram flags a login or imposes flood waits, setup may need to pause and retry later.

### Telegram app registration note

For the MTProto credentials needed by Mission Control, this is not a Telegram Mini App/Web App registration. It is a generic Telegram API application used to obtain `api_id` and `api_hash` for a local user-client. If `my.telegram.org/apps` asks for platform/type, prefer `Desktop` or `Other` rather than `Web App` for this local Mission Control integration.

The website URL is not the local Mission Control URL and is not used as the LAN callback/origin for this integration. It should be a normal valid URL; Telegram does not use it for local runtime access. If the form returns a generic `ERROR`, common causes include invalid/duplicate short name, localhost/private URL, browser/adblock/cookie issues, VPN/IP mismatch, or Telegram's app-registration page being finicky. Retry with a simple app title/short name, `Desktop`/`Other`, and a normal HTTPS URL.

## 18. Inbound Telegram Content Boundary

M Jones confirmed that the important protection for V1 is the source boundary: Mission Control should only ingest Telegram group chats. M Jones has also tightened Telegram account privacy settings so random users cannot add the account to groups. Random private DMs may still arrive in Telegram, but they are outside Mission Control V1 because private DMs are not listed/fetched.

V1 controls:

- Group-only ingestion: list and fetch Telegram group chats only.
- Do not ingest private DMs, one-to-one bot chats, or channels in V1.
- Text-only V1: do not fetch/cache images/files/media in Mission Control V1.
- Telegram remains source of truth; Mission Control uses bounded cache/metadata only.
- Render message bodies with normal React text rendering. No special manual escaping is required from M Jones.

Non-goal for V1:

- Do not add a large prompt-injection/security rules layer beyond the group-only boundary and normal safe web rendering. If V1 later expands beyond group chats, revisits media, or automatically feeds Telegram content into agents, add a focused security review at that time.
