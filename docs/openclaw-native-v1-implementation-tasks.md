# OpenClaw-Native Mission Control V1 — Atomized Implementation Tasks

**Owner:** M Jones
**Agent:** Finn
**Repo:** `Mjones13/dan-mission-control`
**Branch:** `finn/openclaw-native-v1-overnight`
**Created:** 2026-05-19
**Status:** Approved for implementation by M Jones on 2026-05-19 around 02:33 America/New_York; use as controlling task plan for resumed automation/subagents.

## Why this file exists

The PRD/spec describes the product direction and broad phases, but its implementation task list was too high-level to safely drive overnight automation. This file is the missing implementation-ready task plan.

The recurring build runner may resume now that M Jones has reviewed/accepted this file; keep this file as the controlling task plan.

## Task format

`MC-### [P?] [Slice] Task — files: <paths>; depends: <IDs>; verify: <command/check>; acceptance: <observable outcome>`

- `[P]` = can be done in parallel only if a separate worktree/branch is used and dependencies are met.
- `Slice` = functional area or safety gate.
- `files` = exact target files/directories where possible.
- `verify` = command or inspection the agent must run before marking done.

## Global boundaries

### Approved for this slice

- Phase 0: baseline, inventory, repo-state capture.
- Phase 1: product narrowing for v1.
- Phase 2: OpenClaw observability foundations.
- Phase 3: Queue/Inbox and operational task model foundation.
- Phase 4 pathway/scaffold: read-only source-backed coding task indexing design/scaffold only.
- Local docs/checklists needed for review.

### Not approved

- Deployment.
- Push, merge, or PR creation without separate approval.
- New tooling installs or package-manager migration.
- Broad schema migrations/backfills.
- Production data access.
- External sends/notifications.
- Payments, crypto, email/social/ad automation, or Field Ops execution.
- Broad autonomous project execution.
- Silent write-back to source-controlled specs/task files.

## Stop conditions

Stop and report before continuing if:

- A task requires new dependencies, new tooling, package-manager migration, or lockfile changes.
- A task requires broad route/schema/data-model rewrite rather than scoped hide/disable/adapt work.
- A task requires Gateway config/secrets/auth changes.
- A task requires a DB migration/backfill/repair script.
- A task would expose or execute deferred product/autopilot/Field Ops behavior.
- Baseline tests/build fail in a way that changes architecture or scope decisions.
- The task cannot be verified by the listed verification method or an equivalent small gate.

---

## Phase 0 — Baseline and inventory

**Goal:** establish current repo behavior before implementation.
**Independent test:** repo state and baseline command outputs are captured in docs; no app source behavior changes.

- [x] MC-001 [Baseline] Confirm branch and working tree — files: git metadata only; depends: none; verify: `git status --short --branch`; acceptance: branch is `finn/openclaw-native-v1-overnight`, tracked files are clean except planned docs.
- [x] MC-002 [Baseline] Identify package manager and scripts — files: `package.json`, lockfiles; depends: MC-001; verify: inspect `package.json` and lockfiles; acceptance: npm/package-lock is documented as repo convention.
- [x] MC-003 [Baseline] Install dependencies with existing convention — files: `node_modules/` only; depends: MC-002; verify: `npm ci`; acceptance: install completes without package manifest/lockfile edits.
- [x] MC-004 [Baseline] Run lint baseline — files: docs only; depends: MC-003; verify: `npm run lint`; acceptance: warnings/failures recorded.
- [x] MC-005 [Baseline] Run test baseline with timeout — files: docs only; depends: MC-003; verify: `npm run test` with bounded timeout; acceptance: pass/fail/timeout recorded without changing tests.
- [x] MC-006 [Baseline] Inventory routes and primary screens — files: `src/app/**`, docs; depends: MC-001; verify: `find src/app ...`; acceptance: keep/hide/defer route list recorded.
- [x] MC-007 [Baseline] Inventory DB schema areas — files: `src/lib/db/schema.ts`, `src/lib/db/migrations.ts`, docs; depends: MC-001; verify: inspect schema/migrations; acceptance: keep/adapt/defer table groups recorded.

**Checkpoint 0:** no behavior changes yet; M Jones can review baseline evidence.

---

## Phase 1 — Product narrowing / safety first

**Goal:** remove product-autopilot and unsafe external-action surfaces from the primary v1 experience without deleting large code paths.
**Independent test:** primary navigation and dashboard no longer route users into Autopilot/Field-Ops-like flows; direct routes either remain hidden or show disabled/deferred copy.

- [x] MC-101 [Product Narrowing] Add central v1 feature flag helper using existing env/config patterns — files: `src/lib/config.ts` or new `src/lib/feature-flags.ts`; depends: MC-006; verify: `npm run lint`; acceptance: flags default `fieldOpsEnabled=false`, `externalActionsEnabled=false`, `productAutopilotEnabled=false`, `dispatchEnabled=false` without requiring env setup.
- [x] MC-102 [Product Narrowing] Remove Autopilot shortcut from global header when disabled — files: `src/components/Header.tsx`; depends: MC-101; verify: inspect UI code + `npm run lint`; acceptance: `/autopilot` link is absent from primary header by default.
- [x] MC-103 [Product Narrowing] Identify all Autopilot entry points and mark route policy — files: `src/app/autopilot/**`, `src/components/autopilot/**`, docs; depends: MC-006; verify: route inventory diff; acceptance: every Autopilot page is classified as hidden, disabled, or deferred.
- [x] MC-104 [Product Narrowing] Add disabled/deferred route guard for Autopilot root/pages if directly opened — files: `src/app/autopilot/page.tsx`, `src/app/autopilot/[productId]/page.tsx`, child pages as needed; depends: MC-101, MC-103; verify: manual local route inspection or component snapshot if available; acceptance: direct navigation does not expose active product-autopilot workflows by default.
- [x] MC-105 [Product Narrowing] Hide/deemphasize product/program widgets from dashboard/workspace tabs — files: `src/components/WorkspaceDashboard.tsx`, `src/components/WorkspaceTab.tsx`, `src/components/ProductInsights.tsx` if referenced; depends: MC-101, MC-103; verify: `rg "autopilot|Product|products" src/components src/app`; acceptance: primary v1 flow focuses on workspaces/tasks/agents, not product autopilot.
- [x] MC-106 [Product Narrowing] Audit API routes that imply external or product-autopilot execution — files: `src/app/api/products/**`, `src/lib/autopilot/**`, docs; depends: MC-103; verify: read-only inspection; acceptance: list of routes left untouched but not exposed from UI is recorded.
- [x] MC-107 [Product Narrowing] Add safety copy for disabled modules — files: guarded Autopilot pages/components; depends: MC-104; verify: manual UI inspection; acceptance: copy says module is deferred/disabled for v1 and no action can launch.

**Checkpoint 1:** user-visible primary app no longer promotes deferred Dan/Field-Ops/product-autopilot behavior.

---

## Phase 2 — OpenClaw observability foundations

**Goal:** make Mission Control useful as a real OpenClaw/Finn status dashboard even when Gateway is offline.
**Independent test:** status/session UI renders useful states for online, offline, unauthenticated, and empty-session responses.

- [x] MC-201 [OpenClaw] Inspect existing status/session route contracts — files: `src/app/api/openclaw/status/route.ts`, `src/app/api/openclaw/sessions/route.ts`, `src/app/api/openclaw/sessions/[id]/route.ts`, `src/lib/openclaw/client.ts`; depends: MC-006; verify: route source notes; acceptance: current response shapes and error behavior documented.
- [x] MC-202 [OpenClaw] Add or refine normalized Gateway status type — files: `src/lib/types.ts` or new `src/lib/openclaw/status-normalizer.ts`; depends: MC-201; verify: typecheck/build if available, otherwise lint; acceptance: callers get stable `{available, authenticated, error, details}`-style shape without leaking tokens.
- [x] MC-203 [OpenClaw] Add tests for Gateway status normalization — files: `src/lib/openclaw/status-normalizer.test.ts`; depends: MC-202; verify: `npm run test -- src/lib/openclaw/status-normalizer.test.ts` if supported, else `npm run test` bounded; acceptance: offline/online/error cases covered.
- [x] MC-204 [OpenClaw] Harden `/api/openclaw/status` to return normalized safe errors — files: `src/app/api/openclaw/status/route.ts`; depends: MC-202, MC-203; verify: targeted test or route inspection + lint; acceptance: Gateway unavailable is a 200/typed unavailable state or documented non-throwing API behavior.
- [x] MC-205 [OpenClaw] Harden sessions list route for empty/offline cases — files: `src/app/api/openclaw/sessions/route.ts`; depends: MC-201, MC-202; verify: targeted test or manual `curl` against local dev if app running; acceptance: UI callers can distinguish empty from unavailable.
- [x] MC-206 [OpenClaw] Update session count/header behavior to handle unavailable Gateway quietly — files: `src/components/Header.tsx`, possibly `src/components/SessionsList.tsx`; depends: MC-205; verify: lint + manual inspection; acceptance: no noisy console/error loop when Gateway is unavailable.
- [x] MC-207 [OpenClaw] Add dashboard status card/component for OpenClaw Gateway state — files: `src/components/WorkspaceDashboard.tsx` or new `src/components/OpenClawStatusCard.tsx`; depends: MC-204; verify: manual UI inspection; acceptance: dashboard shows useful real status, not mock-only state.
- [x] MC-208 [OpenClaw] Document local OpenClaw setup and known Gateway limitations — files: `README.md` or `docs/openclaw-local-setup.md`; depends: MC-204, MC-205; verify: doc inspection; acceptance: M Jones can see env vars, default URL, offline behavior, and what is read-only.

**Checkpoint 2:** app can be opened locally and explain OpenClaw availability/session state safely.

---

## Phase 3 — Queue / Inbox and operational task model foundation

**Goal:** adapt existing task infrastructure into a v1 operational queue without changing source-backed coding task files.
**Independent test:** M Jones can create/view/filter an operational task/decision/follow-up locally, and source-backed coding tasks remain read-only/out of write path.

- [x] MC-301 [Queue] Inspect current task model/statuses and queue UI — files: `src/lib/db/schema.ts`, `src/app/api/tasks/route.ts`, `src/components/MissionQueue.tsx`, `src/components/TaskModal.tsx`, `src/lib/types.ts`; depends: MC-007; verify: notes in this file or docs; acceptance: adapt-vs-new-layer decision is documented.
- [x] MC-302 [Queue] Define v1 operational task categories and allowed statuses using existing schema where possible — files: `docs/openclaw-native-task-model.md`; depends: MC-301; verify: doc inspection; acceptance: categories include operational task, decision, follow-up, review-needed; statuses map to existing statuses where possible.
- [x] MC-303 [Queue] Add safe task creation constraints for operational tasks — files: `src/app/api/tasks/route.ts`, `src/lib/validation.ts` or task helpers; depends: MC-302; verify: tests/lint; acceptance: v1 task creation does not imply dispatch/external action by default.
- [x] MC-304 [Queue] Add/update tests for task creation/status rules — files: existing task tests or new `src/lib/task-governance.test.ts`; depends: MC-303; verify: targeted npm test if possible; acceptance: operational/decision/review-needed cases covered.
- [x] MC-305 [Queue] Update queue filters/counts for inbox, ready/blocked/running/review/done — files: `src/components/MissionQueue.tsx`, `src/hooks/useUnreadCounts.ts` if needed; depends: MC-303; verify: lint + manual UI inspection; acceptance: queue surfaces v1 states clearly.
- [x] MC-306 [Queue] Make decision/review-needed items first-class in UI copy — files: `src/components/MissionQueue.tsx`, `src/components/TaskModal.tsx`; depends: MC-305; verify: manual UI inspection; acceptance: items requiring M Jones are visually distinguishable.
- [x] MC-307 [Queue] Ensure dispatch remains disabled/gated — files: `src/app/api/tasks/[id]/dispatch/route.ts`, `src/lib/server-dispatch.ts`, UI dispatch buttons if present; depends: MC-101, MC-303; verify: route inspection/test; acceptance: no dispatch can start unless explicit flag/approval path is enabled later.
- [x] MC-308 [Queue] Document queue model and boundaries — files: `docs/openclaw-native-task-model.md`; depends: MC-302 through MC-307; verify: doc inspection; acceptance: operational tasks vs source-backed coding tasks are clearly separated.

**Checkpoint 3:** Mission Control has a safe local queue foundation and does not mutate coding task sources.

---

## Phase 4 pathway — Read-only source-backed coding task index

**Goal:** design/scaffold a conservative read-only source task index path without broad migrations or write-back.
**Independent test:** parser can read checkbox task lines from approved local files and produce deterministic snapshots in memory/test fixtures; no source files are modified.

- [x] MC-401 [Source Index] Identify approved initial source roots/files — files: `docs/openclaw-native-source-index.md`; depends: MC-308; verify: doc inspection; acceptance: default roots are explicit and local, starting with Finn workspace/spec docs only.
- [x] MC-402 [Source Index] Define source-backed task identity model — files: `docs/openclaw-native-source-index.md`; depends: MC-401; verify: doc inspection; acceptance: identity includes source path, line, normalized text/hash, checked state, and no write-back.
- [x] MC-403 [Source Index] Implement parser as isolated pure helper if no schema migration is needed — files: new `src/lib/source-tasks/parser.ts`; depends: MC-402; verify: unit test; acceptance: parses markdown checkbox lines and ignores non-task prose.
- [x] MC-404 [Source Index] Add parser fixtures/tests — files: `src/lib/source-tasks/parser.test.ts`; depends: MC-403; verify: targeted npm test if possible; acceptance: checked/unchecked/nested/path/line/idempotency cases covered.
- [x] MC-405 [Source Index] Scaffold read-only API design only if safe — files: `docs/openclaw-native-source-index.md`; depends: MC-404; verify: doc inspection; acceptance: API contract is documented; implementation stops before DB migration or write-back.
- [x] MC-406 [Source Index] Stop for schema decision if persistence is needed — files: docs only; depends: MC-405; verify: none; acceptance: recommendation is documented rather than silently adding tables.

**Checkpoint 4:** Phase 4 pathway exists as parser/design/scaffold only; persistence/write-back waits for explicit review.

---

## Final verification for this slice

Run the smallest meaningful gates available after implementation tasks:

- [x] MC-901 [Verify] `git status --short` — acceptance: changed files are expected and scoped.
- [x] MC-902 [Verify] `npm run lint` — acceptance: passes or existing warnings are documented separately from new issues.
- [x] MC-903 [Verify] Targeted tests for changed helpers/routes — acceptance: pass or blocker recorded.
- [x] MC-904 [Verify] `npm run build` if feasible — acceptance: pass or blocker recorded.
- [x] MC-905 [Verify] Manual local UI smoke check if app can run — acceptance: primary dashboard, queue, OpenClaw status, and disabled Autopilot paths checked.
- [x] MC-906 [Verify] Handoff summary — files: `docs/finn-overnight-plan.md`; acceptance: completed tasks, changed files, verification, blockers, and next decisions documented.

## Implementation Progress Notes

### 2026-05-19 02:38-02:43 America/New_York — MC-101 feature flag helper

- Added `src/lib/config.ts` as the central v1 safety flag helper.
- Defaults are conservative with no env required: `fieldOpsEnabled=false`, `externalActionsEnabled=false`, `productAutopilotEnabled=false`, and `dispatchEnabled=false`.
- Supported opt-in env names are `NEXT_PUBLIC_MC_FIELD_OPS_ENABLED`/`MC_FIELD_OPS_ENABLED`, `NEXT_PUBLIC_MC_EXTERNAL_ACTIONS_ENABLED`/`MC_EXTERNAL_ACTIONS_ENABLED`, `NEXT_PUBLIC_MC_PRODUCT_AUTOPILOT_ENABLED`/`MC_PRODUCT_AUTOPILOT_ENABLED`, and `NEXT_PUBLIC_MC_DISPATCH_ENABLED`/`MC_DISPATCH_ENABLED`.
- Verification: `npm run lint` completed with existing warnings only.

### 2026-05-19 02:48-02:54 America/New_York — MC-905 local smoke check

- Started local dev server with `PORT=4010 npm run dev`; Next.js reported ready at `http://localhost:4010`.
- Smoke-checked core routes using Python `urllib` because shell `curl`/coreutils were not available in this cron shell path:
  - `/` → 200
  - `/workspace/default` → 200
  - `/api/openclaw/status` → 200 with normalized unavailable/unauthenticated Gateway payload, no token leaked.
  - `/api/openclaw/sessions` → 200 with empty `sessions` and normalized Gateway unavailable/unauthenticated payload.
  - `/autopilot` → 200 with deferred/disabled/OpenClaw-native v1 copy present in rendered HTML.
- Stopped the dev server after smoke verification.

### 2026-05-19 02:58-03:03 America/New_York — MC-906 handoff summary

- Wrote final morning handoff in `docs/finn-overnight-plan.md`.
- Verified current branch/status and ran `git diff --check`; whitespace check passed.
- Investigated and fixed the full `npm run test` hang: `src/lib/health.test.ts` instantiated the OpenClaw client, whose shared periodic cleanup timer kept the Node test process alive. `src/lib/openclaw/client.ts` now calls `unref?.()` on the cleanup and reconnect timers.
- Verification: targeted `src/lib/health.test.ts` passed, full `npm run test` passed, targeted new-work tests passed, typecheck passed, lint passed with existing warnings only, build passed with existing warnings only, and smoke checks passed.

### 2026-05-19 03:08-03:12 America/New_York — No unchecked tasks remain

- Inspected the controlling task plan: no unchecked implementation or verification tasks remain in the approved slice.
- Performed a documentation consistency pass so the handoff reflects that the earlier full-test timeout was fixed and `npm run test` now passes.

## Parallelization rules

Do not parallelize code edits in the main checkout. If M Jones approves code-editing subagents later:

- Each subagent uses a separate Git worktree and branch.
- Each subagent gets exact task IDs, file scope, and verification commands.
- Finn integrates results into the main branch after review.
- No subagent may broaden scope, install dependencies, migrate schema, deploy, push, or enable external actions.

## Review questions for M Jones

1. Is this task breakdown detailed enough to resume the recurring build runner?
2. Should Phase 1 route guards show disabled pages, or should direct Autopilot routes return 404 for v1?
3. For Phase 3, should operational task creation be minimal/manual first, or should chat/request ingestion be included in the next approved slice?
4. For Phase 4, should persistence wait until after parser/UI proof, or should we design a dedicated source task table now for later approval?
