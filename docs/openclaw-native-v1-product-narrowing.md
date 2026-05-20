# OpenClaw-Native V1 Product Narrowing

## Feature flags

Central v1 feature flags live in `src/lib/config.ts` and default to disabled unless an environment variable is explicitly set to `true` or `1`:

- `fieldOpsEnabled` (`NEXT_PUBLIC_FIELD_OPS_ENABLED` / `FIELD_OPS_ENABLED`)
- `externalActionsEnabled` (`NEXT_PUBLIC_EXTERNAL_ACTIONS_ENABLED` / `EXTERNAL_ACTIONS_ENABLED`)
- `productAutopilotEnabled` (`NEXT_PUBLIC_PRODUCT_AUTOPILOT_ENABLED` / `PRODUCT_AUTOPILOT_ENABLED`)
- `dispatchEnabled` (`NEXT_PUBLIC_DISPATCH_ENABLED` / `DISPATCH_ENABLED`)

## Autopilot route policy for v1

Product Autopilot is deferred for v1. Primary navigation hides `/autopilot` by default. Direct Autopilot pages are guarded and render disabled/deferred copy unless `productAutopilotEnabled` is explicitly enabled:

- `/autopilot` — disabled/deferred placeholder by default
- `/autopilot/new` — disabled/deferred placeholder by default
- `/autopilot/[productId]` — disabled/deferred placeholder by default
- `/autopilot/[productId]/health` — disabled/deferred placeholder by default
- `/autopilot/[productId]/review` — disabled/deferred placeholder by default
- `/autopilot/[productId]/swipe` — disabled/deferred placeholder by default

The guarded placeholder does not fetch products, load Autopilot widgets, or expose product actions.

## Product/API execution audit

The existing Product Autopilot API tree remains in the repo but is not exposed from primary navigation or guarded Autopilot routes by default. Routes left untouched for this slice include:

- Product CRUD and metadata: `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`
- Research/ideation/swipe/maybe/batch-review routes under `src/app/api/products/[id]/**`
- Product health, costs, repo-readiness, code exploration, skills, MCP, schedules, rollback, A/B test, and webhook-adjacent product routes under `src/app/api/products/**`
- Autopilot implementation helpers under `src/lib/autopilot/**`

These routes may still be callable directly by an authenticated/local caller. Full API-level enforcement is a separate follow-up because this Phase 1 slice is scoped to product narrowing of the primary v1 experience and safe direct-route deferral, not a broad API rewrite.
