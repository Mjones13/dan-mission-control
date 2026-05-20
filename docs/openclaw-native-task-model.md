# OpenClaw-Native Task Model

Status: V1 queue foundation implemented without schema migration.

## Scope

This document records the Phase 3 Queue/Inbox decision for OpenClaw-native Mission Control. It covers MC-301 through MC-308 and intentionally avoids any source-backed coding task write-back or database schema migration.

## MC-301 adapt-vs-new-layer decision

Decision: adapt the existing `tasks` table for V1 operational queue items, and defer any new persistence layer.

Reasons:

- The current schema already has a `tasks` table with useful queue states: `planning`, `inbox`, `assigned`, `in_progress`, `testing`, `review`, `verification`, `review_fix`, and `done`.
- Existing UI/API surfaces (`/api/tasks`, `MissionQueue`, `TaskModal`) already operate on this model.
- A new task table, category column, source-task table, or migration would cross the approved stop condition for schema changes.
- Source-backed coding tasks must remain a read-only later concept; they should not be silently written into repo task/spec files from this V1 operational queue.

Follow-up decision for a later slice: if category-specific persistence becomes important, add an explicit schema design/review rather than overloading V1 fields silently.

## MC-302 V1 operational task categories

V1 categories are semantic, not persisted as new columns. They map onto existing statuses as follows:

| Category | Purpose | Default status | Allowed existing statuses |
| --- | --- | --- | --- |
| `operational_task` | A local Mission Control work item for triage and execution tracking. | `inbox` | `inbox`, `assigned`, `in_progress`, `review`, `verification`, `done` |
| `decision` | A question or choice for M Jones before work continues. | `review` | `inbox`, `review`, `done` |
| `follow_up` | A later action/reminder that should stay local until explicitly advanced. | `inbox` | `inbox`, `review`, `done` |
| `review_needed` | A result or task needing human review before advancement. | `review` | `review`, `verification`, `done` |

The source of truth for these definitions in code is `src/lib/operational-task-model.ts`.

## Queue group mapping

Mission Queue keeps the existing status columns, but V1 summaries group statuses into operational buckets:

| V1 bucket | Existing statuses |
| --- | --- |
| Inbox | `inbox` |
| Ready | `planning` |
| Running | `pending_dispatch`, `assigned`, `in_progress`, `convoy_active` |
| Decision / review | `testing`, `review`, `verification`, `review_fix` |
| Done | `done` |

## MC-303/MC-304 safe creation constraints

New V1 operational task creation is local-only. `/api/tasks` only accepts these statuses for new tasks:

- `inbox`
- `planning`
- `review`

Creating directly in `assigned`, `in_progress`, `convoy_active`, `testing`, `verification`, `review_fix`, `pending_dispatch`, or `done` is rejected because it can imply runtime dispatch, external action, or completed work without a review path.

`TaskModal` also keeps newly created tasks in `inbox` even when an owner is selected. The owner is a local queue owner at creation time, not an automatic dispatch trigger.

Coverage: `src/lib/operational-task-model.test.ts` verifies safe create statuses, queue bucket mappings, and default dispatch-disabled behavior.

## MC-305/MC-306 queue UI behavior

`MissionQueue` now surfaces V1 summary counts for Inbox, Ready, Running, Decision/review, and Done. Existing columns remain visible to avoid a broad rewrite, but labels and card copy make decision/review-needed items clearer.

Review-like states show copy that distinguishes human review/approval from background runtime progress.

## MC-307 dispatch boundary

Dispatch remains disabled by default. `/api/tasks/[id]/dispatch` returns a 403 unless one of these explicit environment flags is set:

- `DISPATCH_ENABLED=true`
- `EXTERNAL_ACTIONS_ENABLED=true`

This preserves the V1 rule that no dispatch/external action can start unless a later explicit enablement path is configured and reviewed.

## MC-308 source-backed coding task boundary

Operational tasks and source-backed coding tasks are separate concepts:

- Operational tasks live in Mission Control's local `tasks` table.
- Source-backed coding tasks are future read-only index entries derived from approved local files/specs.
- V1 operational task creation must not modify source-controlled task/spec files.
- Any persistence/write-back for source-backed coding tasks needs a later explicit schema and safety review.

## Files touched in this phase

- `docs/openclaw-native-task-model.md`
- `src/lib/operational-task-model.ts`
- `src/lib/operational-task-model.test.ts`
- `src/lib/validation.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[id]/dispatch/route.ts`
- `src/components/MissionQueue.tsx`
- `src/components/TaskModal.tsx`
