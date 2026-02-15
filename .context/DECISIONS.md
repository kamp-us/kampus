# Decisions

<!-- INDEX:START -->
| Date | Decision |
|------|--------|
| 2026-02-14 | Server-side output buffer in DO for reconnect replay |
| 2026-02-14 | Render all tabs simultaneously with CSS visibility:hidden on inactive tabs |
| 2026-02-14 | DO authoritative over layout with per-tab focus |
| 2026-02-14 | No Effect services in v1 — plain TS + Effect Schema only |
| 2026-02-14 | Wormhole protocol = thin mux server over CF Sandbox |
<!-- INDEX:END -->

<!-- DECISION FORMATS

## Quick Format (Y-Statement)

For lightweight decisions, a single statement suffices:

> "In the context of [situation], facing [constraint], we decided for [choice]
> and against [alternatives], to achieve [benefit], accepting that [trade-off]."

## Full Format

For significant decisions:

## [2026-02-14-233233] Server-side output buffer in DO for reconnect replay

**Status**: Accepted

**Context**: Page reload doesn't hibernate DO. CF Sandbox ring buffer only replays on new WS connection. Existing terminal WSes persist but frontend has no history.

**Decision**: Server-side output buffer in DO for reconnect replay

**Rationale**: Alternatives: (1) force-close terminal WSes and reconnect to trigger CF replay — disruptive, loses in-flight data. (2) Per-client terminal WSes — wasteful N*terminals connections. Chose DO-level 64KB ring buffer per pty because it's simple, works for both hibernation and non-hibernation cases.

**Consequences**: Memory scales with pty count (64KB each). Buffer is in-memory only — lost on hibernation, but that case falls back to CF Sandbox replay. Two-layer buffering: server-side for reconnect history, client-side for React mount timing.

---

## [2026-02-14-222748] Render all tabs simultaneously with CSS visibility:hidden on inactive tabs

**Status**: Accepted

**Context**: Switching tabs unmounted ghostty-web terminals, losing output buffer. CF Sandbox has no server-side replay.

**Decision**: Render all tabs simultaneously with CSS visibility:hidden on inactive tabs

**Rationale**: CSS visibility keeps DOM alive so ghostty preserves its buffer. Alternative was server-side ring buffer replay, but CF Sandbox owns buffering and we'd duplicate logic.

**Consequences**: All tab terminals stay mounted in DOM. Memory scales with tab count. Simpler than replay.

---

## [2026-02-14-200548] DO authoritative over layout with per-tab focus

**Status**: Accepted

**Context**: Designing how layout state flows between WormholeServer DO and frontend. Previously layout was in frontend localStorage.

**Decision**: DO authoritative over layout with per-tab focus

**Rationale**: DO-authoritative enables multi-client (tmux attach), multi-device, and eliminates sync issues. Per-tab focus (each tab remembers its focused pane) matches tmux behavior. Against: client-authoritative (faster UI but no multi-client), single global focus (simpler but loses context on tab switch).

**Consequences**: Frontend becomes a dumb renderer — sends intents, receives state. Every user action is a round-trip through DO. Multi-client and multi-device work for free. Slight latency on interactions (round-trip), but correctness wins.

---

## [2026-02-14-200546] No Effect services in v1 — plain TS + Effect Schema only

**Status**: Accepted

**Context**: Designing Wormhole protocol v1 for @kampus/sandbox. Effect.ts is used heavily elsewhere in the codebase.

**Decision**: No Effect services in v1 — plain TS + Effect Schema only

**Rationale**: Protocol is still settling. Effect service boundaries are expensive to refactor if abstractions turn out wrong. Effect Schema gives us typed encode/decode for protocol messages without committing to service architecture. Against: full Effect from the start (premature abstraction), no Effect at all (lose Schema benefits).

**Consequences**: Faster iteration on protocol design. Can add Effect services later when the pain points are clear. Risk: might accumulate tech debt that needs refactoring when Effect is introduced.

---

## [2026-02-14-200425] Wormhole protocol = thin mux server over CF Sandbox

**Status**: Accepted

**Context**: Building multiplexed terminal UI on Cloudflare. CF Sandbox API already handles containers, PTYs, filesystem, output buffering (ring buffer), reconnection, and multi-client terminal sharing. Previously built custom RingBuffer, ManagedSession output distribution, checkpoint/restore in @kampus/sandbox — all duplicating CF capabilities.

**Decision**: Wormhole protocol = thin mux server over CF Sandbox

**Rationale**: CF Sandbox handles all heavy lifting. Our code was reimplementing buffering, session state, and terminal lifecycle that CF already provides. Chose thin mux layer over full custom implementation. Against: keeping custom buffering (redundant), Effect services in v1 (premature abstraction before protocol stabilizes), frontend-managed layout (inconsistent across devices).

**Consequences**: Delete RingBuffer, ManagedSession output distribution, checkpoint of terminal buffers from @kampus/sandbox. DO becomes authoritative over layout — frontend is dumb renderer. v1 uses plain TS + Effect Schema only (no Effect services/layers). Simpler code, fewer bugs, but tightly coupled to CF Sandbox API.

---

## [YYYY-MM-DD] Decision Title

**Status**: Accepted | Superseded | Deprecated

**Context**: What situation prompted this decision? What constraints exist?

**Alternatives Considered**:
- Option A: [Pros] / [Cons]
- Option B: [Pros] / [Cons]

**Decision**: What was decided?

**Rationale**: Why this choice over the alternatives?

**Consequences**: What are the implications? (Include both positive and negative)

**Related**: See also [other decision] | Supersedes [old decision]

## When to Record a Decision

✓ Trade-offs between alternatives
✓ Non-obvious design choices
✓ Choices that affect architecture
✓ "Why" that needs preservation

✗ Minor implementation details
✗ Routine maintenance
✗ Configuration changes
✗ No real alternatives existed

-->
