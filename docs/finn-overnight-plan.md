# Finn Overnight Mission Control Build Plan

## Status

- Owner: M Jones
- Agent: Finn
- Repo: `Mjones13/dan-mission-control`
- Local path: `/Users/mjones/.openclaw/workspace-finn/mission_control_work/dan-mission-control`
- Branch: `finn/openclaw-native-v1-overnight`
- Source PRD/spec: https://docs.google.com/document/d/17W--EC8HZnEy95Z4Me11BSWFw9VksRstNZFgSC308oQ/edit?usp=drivesdk
- Local PRD/spec: `/Users/mjones/.openclaw/workspace-finn/mission_control_references/openclaw_native_mission_control_prd_spec_2026_05_19.md`
- Atomized implementation task plan: `docs/openclaw-native-v1-implementation-tasks.md`
- Spec-planning best-practices review: `/Users/mjones/.openclaw/workspace-finn/mission_control_references/spec_planning_best_practices_2026_05_19.md`
- Scope approval: M Jones approved starting overnight work on Phase 0 through Phase 3, plus a Phase 4 pathway/scaffold, in Telegram group `Finn Work` on 2026-05-19 around 02:11 America/New_York.
- Plan approval: M Jones approved the updated Google Doc PRD/implementation plan in Telegram group `Finn Work` on 2026-05-19 around 02:33 America/New_York and asked Finn to continue implementation using subagents as specified in the docs.
- Automation status: recurring implementation cron may be resumed using `docs/openclaw-native-v1-implementation-tasks.md` as the controlling task plan.

## Approved Scope for Tonight

Work only on the initial OpenClaw-native Mission Control implementation slice:

1. Phase 0: branch, baseline install/test/build, inventory, and repo-state capture.
2. Phase 1: product narrowing for v1.
3. Phase 2: OpenClaw observability foundations.
4. Phase 3: Queue/Inbox and operational task model foundation.
5. Phase 4 pathway: design/scaffold source-backed coding task indexing carefully enough that later implementation is straightforward, without unsafe write-back or broad migrations.
6. Local docs/checklists needed to make the work reviewable in the morning.

## Explicitly Out of Scope Tonight

Do not do any of the following:

- Deploy.
- Push, merge, or open PRs unless M Jones separately approves.
- Delete broadly or perform destructive cleanup.
- Access production data.
- Send external messages/notifications from the app.
- Add payments, crypto transfers, social posting, email campaigns, ad campaigns, or Field Ops execution.
- Start broad autonomous product/project execution.
- Silently write back to source-controlled specs/task files outside this repo.
- Change secrets or expose tokens.
- Install new developer tooling or migrate package managers.
- Perform broad schema migrations without stopping for approval.

## Stop Conditions

Stop and report if any of these occur:

- Baseline install/test/build requires new tooling, package-manager migration, or dependency changes outside the existing lockfile/package manifest.
- The app cannot run or build without a high-impact config, dependency, or environment decision.
- Product narrowing requires broad rewrites rather than hiding/disabling surfaces.
- OpenClaw observability requires changing Gateway config, secrets, auth, or external systems.
- A database migration/backfill/repair script appears necessary.
- Work would require deployment, pushing, merging, production data, external sends, destructive actions, or scope expansion.
- Tests/build failures reveal unclear architecture/product decisions that are not already covered by the PRD/spec.

## Operating Rules for the Overnight Cron Runner

- Work in small idempotent increments.
- Inspect current repo state before each increment.
- Prefer hiding/disabling non-v1 surfaces over deleting large areas of code.
- Keep changes scoped to Phase 0 through Phase 3, plus Phase 4 pathway/scaffolding only.
- Update this plan as tasks complete or new approved in-scope tasks are discovered.
- If no meaningful work remains, write the morning handoff and stop.
- If blocked, write a concise blocker report and stop.
- Run the smallest meaningful verification after each implementation increment when practical.

## Task Queue

This high-level queue is retained as an operational status summary. The implementation-ready task breakdown now lives in `docs/openclaw-native-v1-implementation-tasks.md` and should be treated as the controlling task plan before automation resumes.

### Phase 0 — Baseline and Inventory

- [x] Confirm branch and clean starting state.
- [x] Capture baseline package manager and scripts.
- [x] Run dependency install using the existing repo convention if needed.
- [x] Run baseline test/build/lint/typecheck commands where available.
- [x] Record baseline failures and known environment blockers.
- [x] Inventory top-level app routes and primary navigation surfaces.
- [x] Inventory API routes relevant to tasks, agents, OpenClaw, sessions, events, dispatch, products/autopilot, and external integrations.
- [x] Inventory DB tables and schema areas relevant to v1 keep/hide/defer decisions.

### Phase 1 — Product Narrowing

- [ ] Identify product-autopilot surfaces that should be hidden/deemphasized for v1.
- [ ] Identify Field Ops-like or external-action surfaces that should be hidden/deferred for v1.
- [x] Add or use existing feature/config flags where already safe and scoped.
- [ ] Hide/deprioritize non-v1 screens from primary navigation without deleting large code paths.
- [ ] Add clear disabled/deferred copy where a user could otherwise reach an out-of-scope area.

### Phase 2 — OpenClaw Observability Foundations

- [ ] Inspect existing OpenClaw Gateway client and status/session API behavior.
- [ ] Harden Gateway unavailable/unauthenticated/empty-session states where in scope.
- [ ] Normalize or document current session/subagent visibility gaps.
- [ ] Ensure dashboard can remain useful when Gateway is offline.
- [ ] Add or update lightweight docs for local OpenClaw setup and known limitations.

### Phase 3 — Queue/Inbox and Operational Task Model Foundation

- [ ] Inspect existing task statuses, queue UI, task creation flow, and planning/decision surfaces.
- [ ] Decide whether Phase 3 can safely adapt existing `tasks` semantics or needs a thin Mission-Control-specific layer later.
- [ ] Implement or scaffold v1 queue/inbox foundations only where safe: operational tasks, decisions, blocked/ready/running/done filters, and review-needed states.
- [ ] Preserve source-backed coding tasks as read-only concepts; do not implement silent write-back.
- [ ] Add docs or inline notes for any task-model decisions that must be reviewed later.

### Phase 4 Pathway — Source-Backed Coding Task Index

- [ ] Inspect likely source files and parser entry points for task/spec checkbox indexing.
- [ ] Design or scaffold a read-only parser/index path if it can be done without broad migrations.
- [ ] Define source-backed task identity, source path/line/hash behavior, and idempotency expectations.
- [ ] Do not write back to source-controlled spec/task files.
- [ ] If implementation would require a schema migration or broad data model decision, stop and document the recommended Phase 4 path instead.

### Multi-Worktree/Subagent Concurrency Notes

If code-editing subagents are used later, do not put them in this same checkout concurrently. Use separate Git worktrees and branches, for example:

- Main branch/worktree: `/Users/mjones/.openclaw/workspace-finn/mission_control_work/dan-mission-control` on `finn/openclaw-native-v1-overnight`
- Subagent worktrees root: `/Users/mjones/.openclaw/workspace-finn/mission_control_work/dan-mission-control-worktrees/`
- Example branches: `finn/mc-openclaw-observability`, `finn/mc-queue-foundation`, `finn/mc-source-index-pathway`

Each code-editing subagent must have its own worktree, branch, exact file scope, verification command, and integration plan. Finn integrates/reviews results into the main overnight branch.

### Verification and Handoff

- [x] Re-run meaningful verification after changes.
- [x] Capture `git status --short` and changed files.
- [x] Write morning summary with completed tasks, changed files, verification results, blockers, and next review decisions.

## Overnight Progress Notes

### 2026-05-19 02:08-02:12 America/New_York — Phase 0 baseline

- Branch confirmed: `finn/openclaw-native-v1-overnight`.
- Starting tracked-file state: no tracked modifications; `docs/finn-overnight-plan.md` is an untracked local overnight checklist created for this run.
- Package manager convention: npm with `package-lock.json`; scripts include `dev`, `build`, `start`, `lint`, `test`, `db:seed`, `db:backup`, `db:restore`, and `db:reset`.
- Dependency setup: `npm ci` completed using the existing lockfile. It reported deprecation warnings and `14 vulnerabilities (6 moderate, 7 high, 1 critical)` from npm audit output; no dependency changes were made.
- Baseline verification:
  - Initial `npm run test -- --help` before install failed because `tsx` was unavailable (`node_modules` was missing).
  - After `npm ci`, `npm run test` started successfully and multiple tests passed, but the command exceeded the 180s timeout and was killed by the runner. This is recorded as a baseline test hang/timeout for follow-up.
  - `npm run lint` completed with warnings only; warnings were existing hook dependency / `<img>` warnings in `InsightsTab`, `PlanningTab`, `TaskImages`, `WorkspaceTab`, autopilot components, and cost cap manager.
- Route inventory captured by file inspection:
  - App pages/layouts: `/`, `/activity`, `/settings`, `/workspace/[slug]`, `/workspace/[slug]/activity`, and autopilot pages under `/autopilot` including product health/review/swipe/new screens.
  - API areas: admin backups/rollbacks, agents, costs, demo, errors, events/stream, files, health/metrics, Jira, OpenClaw models/orchestra/sessions/status, products/autopilot support, runtime settings, task images, tasks/unread, webhooks, and workspaces.
- Scope note: no app source behavior changed in this increment; this was Phase 0 baseline setup/inventory only.

## Morning Handoff Template

Use this structure for the morning summary:

1. Branch and repo path.
2. What changed.
3. Completed checklist items.
4. Files changed.
5. Verification commands and results.
6. Known failures/blockers.
7. Scope boundaries respected.
8. Recommended next decision/review action.

### 2026-05-19 02:15 America/New_York — Scope correction

- Corrected overnight scope language after M Jones clarified the runner must continue through Phase 3 and build a Phase 4 pathway/scaffold.
- Phase 3 and Phase 4 pathway items are in scope tonight, subject to the stop conditions above.
- The recurring cron job already carried the expanded Phase 0–3 plus Phase 4 pathway/scaffold scope; this plan file is now aligned with it.

### 2026-05-19 02:16-02:20 America/New_York — Phase 0 DB/schema inventory

- Confirmed scope correction is already reflected in this plan: Phase 0-3 plus Phase 4 pathway/scaffold are approved for tonight.
- DB schema source: `src/lib/db/schema.ts`; migration history source: `src/lib/db/migrations.ts` with migrations through `037 add_jira_sync`.
- Current desired schema contains 53 tables. V1 keep/adapt areas:
  - Core workspace/team/task queue: `workspaces`, `agents`, `tasks`, `workflow_templates`, `task_roles`, `task_notes`, `task_activities`, `task_deliverables`, `events`, `user_task_reads`.
  - OpenClaw/runtime observability: `openclaw_sessions`, `codex_sessions`, `agent_health`, `work_checkpoints`, `agent_mailbox`, `app_settings`.
  - Planning/decision support: `planning_questions`, `planning_specs`, task planning columns (`planning_session_key`, `planning_messages`, `planning_complete`, `planning_spec`, `planning_agents`, `planning_dispatch_error`, `status_reason`).
  - Memory/docs foundation: `knowledge_entries`, plus existing conversations/messages tables if useful for agent/task context.
- Hide/defer areas for v1 product narrowing:
  - Product Autopilot/product-program surfaces: `products`, `research_cycles`, `ideation_cycles`, `autopilot_activity_log`, `ideas`, `idea_embeddings`, `idea_suppressions`, `swipe_history`, `preference_models`, `maybe_pool`, `product_health_scores`, `product_program_variants`, `product_ab_tests`, `product_skills`, `skill_reports`, `codebase_snapshots`, `repo_readiness_checks`, `product_mcp_servers` if present in migrations/runtime.
  - External/Field-Ops-like tables to avoid exposing as active v1 workflows: `product_feedback`, `product_schedules`, `operations_log`, `content_inventory`, `social_queue`, `seo_keywords`, `jira_sync`, plus cost/product coupling tables (`cost_events`, `cost_caps`) unless shown only as passive local observability.
  - Legacy/compatibility: `businesses` should not drive new v1 IA unless needed for compatibility.
- Schema decision: no DB migration/backfill appears necessary for Phase 1-3. Existing `tasks` statuses already include queue/review states (`inbox`, `assigned`, `in_progress`, `testing`, `review`, `verification`, `review_fix`, `done`) and can be adapted cautiously before considering a thin Mission-Control-specific layer.
- Phase 4 pathway implication: source-backed coding task index should start as read-only parsing/scaffold outside DB schema or behind documented design first; adding tables would require a later explicit migration decision.

### 2026-05-19 02:38-02:43 America/New_York — Phase 1 MC-101 feature flags

- Completed MC-101 from `docs/openclaw-native-v1-implementation-tasks.md`.
- Added `src/lib/feature-flags.ts` with conservative v1 defaults: Field Ops, external actions, Product Autopilot, and dispatch all disabled unless explicitly enabled by env.
- Ran `npm run lint`; it completed with the same baseline warnings already recorded, and no new lint errors.

### 2026-05-19 02:33-02:50 America/New_York — Subagent implementation integration

- M Jones approved the updated Google Doc PRD/implementation plan and asked Finn to continue implementation using subagents as specified.
- Created separate worktrees/branches for bounded code-editing subagents:
  - `finn/mc-product-narrowing` at `../dan-mission-control-worktrees/product-narrowing`
  - `finn/mc-openclaw-observability` at `../dan-mission-control-worktrees/openclaw-observability`
  - `finn/mc-queue-foundation` at `../dan-mission-control-worktrees/queue-foundation`
- Integrated reviewed subagent outputs into main branch `finn/openclaw-native-v1-overnight`.
- Phase 1 Product Narrowing completed: v1 feature flags default disabled; primary Autopilot links hidden by default; direct Autopilot UI routes show deferred/disabled copy; product route policy documented.
- Phase 2 OpenClaw Observability completed: normalized Gateway status/session helpers and tests; safe offline/auth/error status route behavior; session route empty/unavailable distinction; dashboard `OpenClawStatusCard`; local OpenClaw setup docs.
- Phase 3 Queue/Inbox foundation completed: operational task model docs/helper/tests; safe task creation status rules; UI-created tasks stay in Inbox by default; dispatch route gated disabled by default; queue copy/grouping improved.
- Phase 4 pathway/scaffold completed: read-only source task index design doc; pure markdown checkbox parser; parser tests; no DB migration, persistence, or write-back.
- Verification after integration:
  - `npx tsx --test src/lib/openclaw/status-normalizer.test.ts src/lib/operational-task-model.test.ts src/lib/source-tasks/parser.test.ts` passed: 10/10.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
  - `npm run lint` passed with existing warnings only.
  - `npm run build` passed with existing warnings only.
- Full-test follow-up: the earlier `npm run test` timeout/hang was traced to the OpenClaw client shared periodic cleanup timer being created during `src/lib/health.test.ts`; `src/lib/openclaw/client.ts` now `unref?.()`s cleanup and reconnect timers so tests can exit cleanly. `src/lib/health.test.ts` and full `npm run test` now pass.

### 2026-05-19 02:48-02:54 America/New_York — MC-905 local UI/API smoke

- Completed MC-905 from `docs/openclaw-native-v1-implementation-tasks.md`.
- Ran local Next dev server; app started successfully.
- Smoke results via Python HTTP requests: `/` 200, `/autopilot` 200 with deferred/disabled copy, `/autopilot/new` 200 with deferred/disabled copy, `/autopilot/test-product` 200 with deferred/disabled copy, `/api/openclaw/status` 200 normalized unavailable/unauthenticated, `/api/openclaw/sessions` 200 empty sessions with normalized Gateway state.
- Dev server was stopped after verification.
- Note: `curl` was unavailable in this shell path, so Python `urllib` was used instead.

### 2026-05-19 02:55-03:04 America/New_York — Full test hang fix and final handoff

- Root cause: `src/lib/health.test.ts` calls `getHealthDetail()`, which instantiates the OpenClaw client through the Gateway health check. The client started a shared periodic cleanup timer; the timer was harmless in app runtime but kept the Node test process alive.
- Fix: `src/lib/openclaw/client.ts` now calls `unref?.()` on the shared cleanup timer and reconnect timer. This preserves runtime behavior while allowing tests/short scripts to exit naturally.
- Verification:
  - `NODE_ENV=test DATABASE_PATH=.tmp/health-fix-test.db npx tsx --test src/lib/health.test.ts` passed: 4/4.
  - `npm run test` passed: 27/27 under the repo script.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
  - `npm run lint` passed with existing warnings only.
  - `npm run build` passed with existing warnings only.
- MC-906 handoff summary completed here; no approved implementation tasks remain unchecked in this slice.

## Morning Handoff — 2026-05-19 03:03 America/New_York

### 1. Branch and repo path

- Repo: `/Users/mjones/.openclaw/workspace-finn/mission_control_work/dan-mission-control`
- Branch: `finn/openclaw-native-v1-overnight`
- Controlling task plan: `docs/openclaw-native-v1-implementation-tasks.md`

### 2. What changed

- Phase 0 baseline/inventory captured.
- Phase 1 product narrowing completed: Product Autopilot/Field-Ops-like surfaces are hidden/deferred by default, central safety flags default off, and disabled copy is shown for direct Autopilot routes.
- Phase 2 OpenClaw observability completed: normalized Gateway status/session behavior, safe unavailable/unauthenticated responses, header/session quiet handling, dashboard status card, and local setup docs.
- Phase 3 queue/inbox foundation completed: operational task model docs/helper/tests, safe creation defaults, clearer queue grouping/copy for decision/review states, and dispatch gated off by default.
- Phase 4 pathway/scaffold completed: read-only source-backed task design, pure markdown checkbox parser, parser tests, and explicit stop before persistence/schema/write-back.

### 3. Completed checklist items

- `MC-001` through `MC-007`: Phase 0 baseline and inventory.
- `MC-101` through `MC-107`: Phase 1 product narrowing/safety.
- `MC-201` through `MC-208`: Phase 2 OpenClaw observability.
- `MC-301` through `MC-308`: Phase 3 queue/inbox and operational task model.
- `MC-401` through `MC-406`: Phase 4 read-only source index pathway.
- `MC-901` through `MC-906`: final verification and handoff completed; the earlier full-test timeout was investigated and fixed.

### 4. Files changed

Tracked modified files:

- `src/app/api/openclaw/sessions/route.ts`
- `src/app/api/openclaw/status/route.ts`
- `src/app/api/tasks/[id]/dispatch/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/autopilot/[productId]/health/page.tsx`
- `src/app/autopilot/[productId]/page.tsx`
- `src/app/autopilot/[productId]/review/page.tsx`
- `src/app/autopilot/[productId]/swipe/page.tsx`
- `src/app/autopilot/new/page.tsx`
- `src/app/autopilot/page.tsx`
- `src/components/Header.tsx`
- `src/components/MissionQueue.tsx`
- `src/components/TaskModal.tsx`
- `src/components/WorkspaceDashboard.tsx`
- `src/lib/config.ts`
- `src/lib/openclaw/client.ts`
- `src/lib/validation.ts`

New files:

- `docs/finn-overnight-plan.md`
- `docs/openclaw-local-setup.md`
- `docs/openclaw-native-source-index.md`
- `docs/openclaw-native-task-model.md`
- `docs/openclaw-native-v1-implementation-tasks.md`
- `docs/openclaw-native-v1-product-narrowing.md`
- `src/components/OpenClawStatusCard.tsx`
- `src/components/autopilot/DeferredAutopilotModule.tsx`
- `src/lib/openclaw/status-normalizer.test.ts`
- `src/lib/openclaw/status-normalizer.ts`
- `src/lib/operational-task-model.test.ts`
- `src/lib/operational-task-model.ts`
- `src/lib/source-tasks/parser.test.ts`
- `src/lib/source-tasks/parser.ts`

### 5. Verification commands and results

- `npm ci` — passed using existing `package-lock.json`; npm audit reported existing vulnerabilities, no dependency/lockfile changes made.
- `npm run lint` — passed with existing warnings only.
- `npx tsx --test src/lib/openclaw/status-normalizer.test.ts src/lib/operational-task-model.test.ts src/lib/source-tasks/parser.test.ts` — passed 10/10 targeted tests.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed with existing warnings only.
- `git diff --check` — passed.
- `PORT=4010 npm run dev` plus Python `urllib` smoke checks — passed: `/`, `/workspace/default`, `/api/openclaw/status`, `/api/openclaw/sessions`, and `/autopilot` returned 200; Gateway unavailable/unauthenticated state was normalized; Autopilot page rendered deferred/disabled v1 copy.
- `NODE_ENV=test DATABASE_PATH=.tmp/health-fix-test.db npx tsx --test src/lib/health.test.ts` — passed 4/4 while validating the test-hang fix.
- `npm run test` — passed 27/27 after unref-ing OpenClaw client cleanup/reconnect timers.

### 6. Known failures/blockers

- No current test blocker remains; the earlier full-test timeout was fixed in `src/lib/openclaw/client.ts`.
- Gateway responded as unavailable/unauthenticated because no Gateway auth token was configured for this local app run. This is expected and now handled safely in UI/API state.
- No deployment, push, PR creation, schema migration, dependency change, production data access, or external sends were performed.

### 7. Scope boundaries respected

- Work stayed inside the approved repo/worktree.
- Product Autopilot and external-action capabilities were deferred/hidden/gated rather than deleted or enabled.
- Dispatch is disabled by default behind explicit flags.
- Phase 4 source-backed task work is read-only parser/design/scaffold only; no persistence, schema migration, or write-back was added.

### 8. Recommended next decision/review action

- Review the diff as a single overnight implementation slice.
- Decide whether direct Autopilot routes should keep the current disabled/deferred pages or become 404s for v1.
- Decide whether Phase 4 persistence should remain deferred until parser/UI proof, or whether to approve a dedicated source-task table in a later slice.
- If the slice looks good, next work should focus on review cleanup and any requested UX copy adjustments before commit/PR.

### 2026-05-19 03:08-03:12 America/New_York — Final handoff consistency pass

- No unchecked tasks remain in `docs/openclaw-native-v1-implementation-tasks.md`.
- Updated the final morning handoff to reflect the latest verification truth: the earlier full `npm run test` timeout was fixed, and full tests now pass.
- Verification: docs inspected and `git diff --check` rerun successfully.
