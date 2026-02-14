# Wormhole Multiplexed Sessions: Implementation Plan

## Phases

### Phase 1: Protocol Layer (`packages/wormhole`)

| Task | Description |
|------|-------------|
| Add `MuxProtocol.ts` | Binary frame helpers (`frame`, `deframe`, `CONTROL_CHANNEL`) + control message schemas |
| Add `ChannelMap.ts` | Channel allocation service (allocate, release, bidirectional lookup) |
| Add `ChannelExhaustedError` | New error in `Errors.ts` |
| Add `MuxServer.ts` | Multiplexed connection handler (demux frames, dispatch control, relay I/O) |
| Tests | Unit tests for framing, channel map, mux server |

### Phase 2: Worker Integration (`apps/worker`)

| Task | Description |
|------|-------------|
| Auth on wormhole route | Extract user ID from request, route to `idFromName(userId)` |
| Wire `MuxServer` into `WormholeDO` | Detect binary upgrade, use `MuxServer.handleConnection` |
| Keep backwards compat | Existing text-based path unchanged |

### Phase 3: Frontend (`apps/kamp-us`)

| Task | Description |
|------|-------------|
| Add dependencies | `@usirin/layout-tree` |
| `WormholeGateway` | React context: single binary WebSocket, mux/demux, control message dispatch |
| `useChannelTerminal` | Hook: bind ghostty terminal ↔ channel via gateway |
| `useWormholeLayout` | Hook: layout-tree state + split/close actions |
| `WormholeLayout` + `TerminalPane` | Recursive tiled renderer + individual pane component |
| Update `Wormhole.tsx` | New multiplexed mode at `/wormhole` |

### Phase 4: Polish

| Task | Description |
|------|-------------|
| Reconnect flow | On connect, send `session_list`, re-attach, rebuild layout |
| Keyboard shortcuts | Split/close pane shortcuts |
| Resize handling | Container resize → recalculate pane sizes → send resize per channel |

## Current Status

See [prd.json](./prd.json) for task-level tracking.

## File Dependency Order

```
1. Errors.ts (ChannelExhaustedError)      — no deps
2. MuxProtocol.ts (frame/deframe/schemas) — no deps
3. ChannelMap.ts                           — depends on Errors
4. MuxServer.ts                            — depends on ChannelMap, MuxProtocol, SessionStore
5. WormholeDO.ts updates                   — depends on MuxServer
6. Frontend components                     — depends on MuxProtocol (shared types)
```
