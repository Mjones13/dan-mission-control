# Local OpenClaw Gateway Setup and Observability Notes

Mission Control now treats the OpenClaw Gateway as a local, optional observability source. The app should still render when the Gateway is offline, empty, or not authenticated.

## Local environment

- Default Gateway WebSocket URL: `ws://127.0.0.1:18789`
- Override URL: `OPENCLAW_GATEWAY_URL`
- Optional token: `OPENCLAW_GATEWAY_TOKEN`
- Mission Control strips token query params from status responses before returning them to UI callers.

## Current route contracts inspected

### `GET /api/openclaw/status`

Previous behavior returned mixed fields such as `connected`, `sessions_count`, `sessions`, `gateway_url`, and sometimes error text. Gateway connect failures returned JSON but live-session failures were not normalized.

Current normalized response shape:

```json
{
  "available": true,
  "authenticated": true,
  "error": null,
  "errorKind": null,
  "details": {
    "gatewayUrl": "ws://127.0.0.1:18789/",
    "sessionsCount": 0,
    "checkedAt": "2026-05-19T06:00:00.000Z"
  }
}
```

Offline, unauthenticated, and timeout states return HTTP 200 with `available/authenticated/error/errorKind` set, so dashboard callers do not need exception-style flow for expected local Gateway states.

### `GET /api/openclaw/sessions`

- With `session_type` or `status` query params, the route still returns the existing database-backed array for compatibility with current header/sidebar callers.
- Without filters, the route returns:

```json
{
  "sessions": [],
  "gateway": {
    "available": false,
    "authenticated": false,
    "error": "Failed to connect to OpenClaw Gateway",
    "errorKind": "unavailable",
    "details": {
      "gatewayUrl": "ws://127.0.0.1:18789/",
      "sessionsCount": 0,
      "checkedAt": "2026-05-19T06:00:00.000Z"
    }
  },
  "empty": true,
  "unavailable": true
}
```

This lets UI callers distinguish an empty live session list (`empty: true`, `gateway.available: true`) from an unavailable Gateway (`unavailable: true`, `gateway.available: false`).

### `GET /api/openclaw/sessions/[id]`

This route still queries live Gateway sessions and can return 503/404/500. It was inspected but not broadened in this slice because MC-205 focuses on the list route and UI count behavior.

## Dashboard behavior

The workspace dashboard includes an OpenClaw Gateway card that polls `/api/openclaw/status` every 30 seconds and shows:

- Gateway online with live session count.
- Gateway offline with local-mode copy.
- Authentication/timeout-limited states without leaking tokens.

## Known limitations

- This is read-only observability/status work. It does not change Gateway config, secrets, auth, pairing, or device identity behavior.
- Filtered session-list calls remain database-backed arrays for compatibility.
- Creating sessions and sending messages still use the existing error behavior and can return 503 when Gateway connection is required.
- No production data, deploy, push, schema migration, or package changes were performed for this slice.
