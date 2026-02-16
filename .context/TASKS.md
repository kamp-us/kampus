# Tasks

<!--
UPDATE WHEN:
- New work is identified → add task with #added timestamp
- Starting work → add #in-progress or #started timestamp
- Work completes → mark [x] with #done timestamp
- Work is blocked → add to Blocked section with reason
- Scope changes → update task description inline

DO NOT UPDATE FOR:
- Reorganizing or moving tasks (violates CONSTITUTION)
- Removing completed tasks (use ctx tasks archive instead)

STRUCTURE RULES (see CONSTITUTION.md):
- Tasks stay in their Phase section permanently — never move them
- Use inline labels: #in-progress, #blocked, #priority:high
- Mark completed: [x], skipped: [-] (with reason)
- Never delete tasks, never remove Phase headers
-->

### Phase 1: [Name] `#priority:high`
- [ ] Clean up @kampus/wormhole package (old, no longer imported by live code) #added:2026-02-14-222749

- [ ] Add reconnect retry limit — track per-ptyId attempt count, fail permanently after N attempts to prevent unbounded reconnect loops when sandbox is permanently dead #priority:medium #added:2026-02-15

- [x] Handle stale sessions on reconnect — detect dead terminal WSes and show session expired state instead of blank pane #added:2026-02-14-222749 #done:2026-02-15

- [x] Implement tab + focus wrapper on top of @usirin/layout-tree #priority:medium #added:2026-02-14-200550 #done:2026-02-14

- [x] Create Wormhole protocol implementation plan #priority:high #added:2026-02-14-200549 #done:2026-02-14

- [ ] Task 1
- [ ] Task 2

### Phase 2: [Name] `#priority:medium`
- [ ] Task 1
- [ ] Task 2

## Blocked

## Reference

**Task Status Labels**:
- `[ ]` — pending
- `[x]` — completed
- `[-]` — skipped (with reason)
- `#in-progress` — currently being worked on (add inline, don't move task)
