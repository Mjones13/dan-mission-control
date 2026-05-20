# OpenClaw-Native Source Task Index Pathway

## Status

Phase 4 pathway/scaffold for OpenClaw-native Mission Control v1.

This design is intentionally read-only. It does not add database tables, migrations, background scanners, or write-back to source-controlled task/spec files.

## Initial approved source roots

Start with local, explicit, M Jones-owned workspace/spec files only:

- `/Users/mjones/.openclaw/workspace-finn/CODING_WORKFLOW.md`
- `/Users/mjones/.openclaw/workspace-finn/mission_control_references/*.md`
- `/Users/mjones/.openclaw/workspace-finn/mission_control_work/dan-mission-control/docs/*.md`

Future expansion to arbitrary repos, Google Docs, GitHub issues, or other agents' workspaces should be separately reviewed because it changes privacy, scope, and task ownership behavior.

## Source-backed task identity

Each parsed source-backed task snapshot should be identified by:

- `sourcePath`: absolute or configured project-relative file path.
- `lineNumber`: 1-based source line number at parse time.
- `text`: normalized checkbox text.
- `checked`: checkbox state from `[ ]`, `[x]`, or `[X]`.
- `indent`: leading whitespace count, useful for hierarchy display.
- `contentHash`: stable hash of source path + line text + checked state.

Line number is useful for linking, but it is not stable enough by itself. Later persistence should use `contentHash` plus source path, and should tolerate line movement.

## Read-only behavior

Mission Control may:

- Parse markdown checkbox tasks.
- Display source-backed tasks as read-only.
- Link back to source path/line.
- Cache snapshots in memory or in a future reviewed persistence layer.

Mission Control must not, in this v1 pathway:

- Toggle checkbox state in source files.
- Rewrite specs/task files.
- Add task IDs to source files automatically.
- Treat parsed tasks as dispatchable operational tasks by default.
- Add DB tables/migrations without explicit review.

## Parser contract

The parser lives at:

- `src/lib/source-tasks/parser.ts`

It accepts markdown content plus a `sourcePath` and returns deterministic source task snapshots for lines matching markdown checkbox syntax:

- `- [ ] Do thing`
- `- [x] Done thing`
- `  - [X] Nested done thing`

It intentionally ignores prose, numbered list items without checkboxes, and malformed checkbox-like text.

## Future API contract sketch

A later reviewed API could expose:

```ts
GET /api/source-tasks?root=<configured-root-id>
```

Response shape:

```ts
{
  "tasks": [
    {
      "sourcePath": "docs/example.md",
      "lineNumber": 12,
      "checked": false,
      "text": "Implement queue filters",
      "indent": 0,
      "contentHash": "..."
    }
  ],
  "readOnly": true
}
```

Do not implement persistence or write endpoints until M Jones approves that next slice.

## Phase 4 decision

No persistence is added in this slice. If Mission Control needs source-backed task history, dedupe across edits, user annotations, or UI filtering beyond in-memory snapshots, stop and design a dedicated persistence model for review first.
