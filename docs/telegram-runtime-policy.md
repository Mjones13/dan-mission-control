# Telegram Runtime Policy

Mission Control exposes a client-safe Telegram polling policy from `GET /api/telegram/status` as `telegramPolicy`.

This keeps React components environment-agnostic: components use policy values instead of branching on stable/preview/test.

## Defaults

- Stable (`MISSION_CONTROL_ENV=stable`, or `PORT=4000` when unset):
  - `pollingMode`: `normal`
  - chat list: `15000` ms
  - selected chat: `10000` ms
  - closed-widget badge: `30000` ms
  - hidden tabs: no polling
  - these values preserve the currently deployed stable behavior from the pre-policy components
- Preview (fallback when env/port is unset):
  - `pollingMode`: `manual`
  - chat list: `120000` ms if slow/normal is enabled
  - selected chat: `60000` ms if slow/normal is enabled
  - closed-widget badge: disabled (`0`)
  - hidden tabs: no polling
- Test (`NODE_ENV=test` or `MISSION_CONTROL_ENV=test`): disabled/manual-only polling.

## Environment variables

```env
MISSION_CONTROL_ENV=stable|preview|test
MISSION_CONTROL_TELEGRAM_POLLING_MODE=normal|slow|manual|disabled
MISSION_CONTROL_TELEGRAM_CHAT_LIST_POLL_MS=15000
MISSION_CONTROL_TELEGRAM_SELECTED_POLL_MS=10000
MISSION_CONTROL_TELEGRAM_BADGE_POLL_MS=30000
MISSION_CONTROL_TELEGRAM_POLL_WHEN_HIDDEN=false
```

Intervals are clamped to a 5s minimum and 10m maximum. `0` disables that interval.

## Integration notes

This change was originally stacked on PR #4 (`finn/mc-chat-request-hardening`). PR #4 has since merged into `main`; this branch now includes current `origin/main` and preserves the selected-message abort/stale-response guards from that work.
