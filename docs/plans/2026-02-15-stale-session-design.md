# Stale Session Detection & Lazy Reconnect

## Problem

Sandbox container sleeps after ~10min inactivity. Terminal WSes (DO -> Sandbox) close.
The `close` handler fires: cleans `this.terminals`, deletes output buffers, sends
`session_exit`. But the layout is untouched — panes become zombies. Frontend receives
`session_exit` but ignores it (`break;` no-op). User sees panes that look alive but
silently drop all input.

## Design

### Core Idea

`this.terminals.has(ptyId)` already IS the connection state. Derive it, broadcast it,
and reconnect lazily on interaction.

### Backend (WormholeServer.ts)

**Terminal WS close handler** — change from current behavior:
- Keep output buffers (pane retains last visible output)
- Don't send `session_exit` (replaced by connection status in layout state)
- Broadcast layout update (client sees `connected: false` immediately)
- Keep channel assigned (frontend can still send data to trigger reconnect)

**State messages** — add `connected` field:
- `StateMessage` and `LayoutUpdateMessage` get `connected: Record<string, boolean>`
- Derived from `this.terminals`: `connected[ptyId] = this.terminals.has(ptyId)`
- Sent alongside existing `channels` field

**Input to disconnected pane** — lazy reconnect:
- `webSocketMessage` receives input for a ptyId where `this.terminals.get(ptyId)` is undefined
- Look up sandboxId via `getSessionForPty(ptyId)`
- Call `createTerminalWs(sandboxId, ptyId, cols, rows)` to reconnect
- On success: new channel assigned, broadcast layout update, pane goes `connected: true`
- Buffer the triggering keystroke and send after reconnect

### Protocol (Protocol.ts)

- Add `connected: S.Record({key: S.String, value: S.Boolean})` to `StateMessage` and
  `LayoutUpdateMessage`
- Remove `SessionExitMessage` — no longer needed, connection status is in layout state
- Remove `session_exit` from `ServerMessage` union

### Frontend

**use-wormhole-client.ts:**
- Add `connected: Record<string, boolean>` to client state
- Handle `connected` field from `state` and `layout_update` messages
- Remove dead `session_exit` case

**PaneLayout.tsx:**
- Pass `connected[paneId]` to `TerminalPane`

**TerminalPane.tsx:**
- Accept `connected` prop
- When `connected === false`: render overlay on top of terminal (absolute positioned sibling)
- Overlay: dimmed background + "Disconnected — press any key to reconnect" text
- Terminal still visible underneath (last output preserved)
- Keystrokes still flow through to server (server handles reconnect)

## Data Flow

```
Sandbox sleeps
  -> terminal WS closes
  -> close handler: keep buffers, keep channel, broadcast layout update
  -> client receives layout_update with connected[ptyId] = false
  -> TerminalPane renders "Disconnected" overlay

User presses key
  -> useChannelTerminal sends data on existing channel
  -> server: channelMap.getPtyId(channel) succeeds, terminals.get(ptyId) = undefined
  -> server triggers reconnectTerminal(ptyId, payload)
  -> sandbox wakes, new PTY created, same channel kept
  -> broadcast layout_update with connected[ptyId] = true
  -> client updates: overlay disappears, terminal resumes
```

## Edge Cases

- **Reconnect fails** (sandbox permanently dead): pane stays disconnected. Future:
  add retry limit + "Session expired" state.
- **Fresh shell after sandbox sleep**: old output still displayed, new prompt appears
  at bottom. Cosmetic mismatch — acceptable for v1.
- **Keystroke that triggers reconnect**: buffered and sent after WS established.
  If buffer fails, lost — acceptable for v1.

## Files Changed

| File | Change |
|------|--------|
| `packages/sandbox/src/Protocol.ts` | Add `connected` to state messages, remove `SessionExitMessage` |
| `apps/worker/src/features/sandbox/WormholeServer.ts` | Close handler, state builder, input reconnect |
| `apps/kamp-us/src/wormhole/use-wormhole-client.ts` | Track `connected` state, remove session_exit |
| `apps/kamp-us/src/wormhole/PaneLayout.tsx` | Pass connected status to panes |
| `apps/kamp-us/src/wormhole/TerminalPane.tsx` | Disconnected overlay |
| `apps/kamp-us/src/wormhole/WormholeLayout.module.css` | Overlay styles |
