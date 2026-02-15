# Wormhole Protocol: Tmux over CF Sandbox

## Summary

Wormhole is a tmux-like multiplexing protocol over Cloudflare Sandbox's terminal API. CF Sandbox runs the computer (containers, PTYs, filesystem, buffering). Wormhole is the window manager (session metadata, tabs, pane layout, channel multiplexing). Lives in `@kampus/sandbox`.

## Mental Model

| tmux | Our concept | CF Sandbox | UI |
|---|---|---|---|
| tmux server | WormholeServer (DO per user) | — | — |
| session | Session | 1 CF Sandbox per session | Session switcher |
| window | Tab | — | Tab bar |
| pane | Pane | CF terminal session | Split within tab |

```
WormholeServer (DO, one per user)
├── Session "dev" (CF Sandbox A)        <- environment, isolated filesystem
│   ├── Tab 1 "main"                    <- tab bar
│   │   └── Layout Tree
│   │       ├── Pane 0 (CF terminal)    <- all share Sandbox A filesystem
│   │       └── Pane 1 (CF terminal)
│   └── Tab 2 "tests"
│       └── Layout Tree
│           └── Pane 0 (CF terminal)
├── Session "infra" (CF Sandbox B)      <- different environment
│   └── Tab 1 "deploy"
│       └── Layout Tree
│           └── Pane 0 (CF terminal)
```

## Architecture

### What CF Sandbox handles (not our code)

- Container lifecycle, filesystem, process management
- PTY sessions with independent shell state (env, cwd, history)
- Output buffering via server-side ring buffer (reconnect replays history)
- Multi-client terminal sharing
- WebSocket proxy for terminal I/O

### What WormholeServer handles (our code)

- Flat session table: which CF Sandboxes exist, names, metadata
- Tabs + layout: how PTYs are arranged on screen (uses `@usirin/layout-tree`)
- Channel multiplexing: N PTYs over 1 WebSocket
- Resilience glue: detect sandbox sleep, reconnect, notify client
- Focus state: per-tab focused pane

### Responsibility boundaries

| Layer | Responsibility |
|---|---|
| CF Sandbox | Run containers, PTYs, filesystem, buffering, reconnect |
| WormholeServer DO | Session metadata, tabs, layout, Wormhole protocol, resilience |
| Frontend | Render what DO says, send user intents |

## Tech Stack (v1)

- **Plain TypeScript** for DO, WormholeHandler, protocol logic
- **Effect Schema** for protocol message encoding/decoding, state validation
- **`@usirin/layout-tree`** as dependency (no fork) for pane layout
- **Tabs + focus** as a thin wrapper around layout-tree in `@kampus/sandbox`
- **Raw CF Workers API** for DO lifecycle, WS handlers, storage

No Effect services/layers/runtime in v1. Add when the protocol stabilizes and we feel the pain.

## DO State

### Persisted (DO storage)

```typescript
interface WormholeServerState {
  sessions: SessionRecord[]
  tabs: TabRecord[]
}

interface SessionRecord {
  id: string
  sandboxId: string     // CF Sandbox ID, e.g. "user-{userId}-session-{id}"
  name: string
  createdAt: number
}

interface TabRecord {
  id: string
  sessionId: string     // which session this tab belongs to
  name: string
  layout: SerializedTree // @usirin/layout-tree serialized; Window.key = ptyId
  focus: StackPath       // focused pane path within this tab
}
```

### In-memory only (rebuilt on wake)

```typescript
interface WormholeServerRuntime {
  sandbox: Map<string, CfSandbox>    // sessionId -> live CF Sandbox handle
  terminals: Map<string, WebSocket>  // ptyId -> live CF terminal WS
  channelMap: ChannelMap             // channel <-> ptyId
  clients: Set<WebSocket>            // hibernatable client connections
}
```

Storage = metadata only. Runtime = live connections, rebuilt on wake.

## Protocol

### Binary framing

- `[1-byte channel][payload]` for terminal I/O
- Channel 255 = control channel (JSON)
- Channels 0-254 = raw PTY data

### Control messages

#### Client -> DO

| Message | Payload | DO behavior |
|---|---|---|
| `connect` | `{cols, rows}` | Returns full state, eager reconnect all PTYs |
| `session_create` | `{name}` | Creates CF Sandbox, adds session, creates default tab with one pane |
| `session_destroy` | `{sessionId}` | Destroys CF Sandbox, removes all tabs for that session |
| `session_rename` | `{sessionId, name}` | Updates session name |
| `tab_create` | `{sessionId, name}` | Adds tab with one pane (new PTY in session's sandbox) |
| `tab_close` | `{tabId}` | Removes tab, destroys orphaned PTYs |
| `tab_rename` | `{tabId, name}` | Updates tab name |
| `tab_switch` | `{tabId}` | Changes active tab, returns channel assignments for that tab's panes |
| `pane_split` | `{orientation, cols, rows}` | Creates PTY in active session's sandbox, splits focused pane, assigns channel |
| `pane_close` | `{paneId}` | Destroys PTY, removes from layout, updates focus |
| `pane_resize` | `{cols, rows}` | Forwards resize to focused PTY |
| `pane_focus` | `{direction}` | Moves focus within active tab |

#### DO -> Client

| Message | Payload |
|---|---|
| `state` | Full state: sessions, tabs, active tab, channels, focus |
| `layout_update` | Updated tab layout + channels + focus |
| `session_exit` | `{sessionId, ptyId, channel, exitCode}` |
| `sessions_reset` | `{sessionId}` — sandbox slept, all PTYs dead, layout preserved |

Key principle: client sends intents, DO executes atomically, responds with new state.

## Resilience Model

### CF Sandbox sleeps (10 min inactivity)

All terminal sessions within that sandbox die.

1. DO detects via WS close events from CF terminal connections
2. DO marks session as `sleeping`, layout preserved in storage
3. On next client input: `getSandbox()` wakes container, recreate PTYs, reassign channels
4. Client gets `sessions_reset` or fresh `state` with new channels

### DO hibernates (no client WS activity)

Client WS stays alive (DO WS hibernation). CF terminal WSes drop.

1. On client input: DO wakes
2. Hydrate layout from DO storage
3. Eager reconnect ALL terminals (not lazy per-channel)
4. If sandbox alive: CF replays buffered output, seamless
5. If sandbox slept: recreate PTYs, notify client

### Individual PTY exits

1. DO detects via WS close on that PTY's connection
2. Sends `session_exit` to client
3. Layout preserved — pane shows "exited"
4. Client can close pane or request respawn

### Core principle

Layout never dies. PTYs come and go, layout persists in DO storage. Reconnection = restore layout, reconnect PTYs best-effort.

### Wake strategy: eager

On any wake event, reconnect ALL terminals in parallel. No partial states. The system is either fully alive or fully recovering. Eager reconnect means:
- Fail fast: discover sandbox death immediately
- Recover atomically: all terminals reconnect or all recreate
- Simpler state machine: fewer states = fewer bugs

## Multi-client

tmux model: all attached clients see the same thing, all can type.

- Channel assignments are global, not per-client. Channel 3 = same PTY for everyone.
- PTY output is broadcast to ALL connected clients.
- Input from ANY client goes to the PTY.
- Focus is DO-authoritative. If client A moves focus, client B sees it.
- Tab switching is shared. One active tab globally.

v1: shared everything. One session state, N viewers.

## Frontend Contract

Frontend is a dumb terminal renderer. No layout logic, no session management.

### React state

```typescript
interface MuxClientState {
  sessions: SessionRecord[]
  tabs: TabRecord[]
  activeTab: string
  channels: Map<string, number>  // ptyId -> channel
  connected: boolean
}
```

### Behavior

```
onConnect      -> send "connect"       -> receive "state"        -> setState
onMessage(bin) -> route by channel     -> write to ghostty-react instance
onMessage(ctrl)-> parse control msg    -> setState(newState)
onKeypress     -> encode [channel][bytes] -> send over WS
```

### User actions

All send control messages, wait for state update from DO:

```
splitPane(dir)      -> send "pane_split"     -> layout_update
closePane()         -> send "pane_close"     -> layout_update
createSession(name) -> send "session_create" -> state
switchTab(id)       -> send "tab_switch"     -> layout_update
moveFocus(dir)      -> send "pane_focus"     -> layout_update
```

### Component tree

```
<MuxClient>                         <- WS connection, state holder
  <SessionBar />                    <- session list, create/switch/destroy
  <TabBar />                        <- tabs for active session
  <PaneLayout tree={activeTab.layout}>  <- renders layout-tree
    <Pane channel={n}>              <- ghostty-react instance per leaf
      <GhosttyTerminal />
    </Pane>
  </PaneLayout>
</MuxClient>
```

Key rule: frontend NEVER mutates layout locally. Every action is a round-trip through the DO.

## What gets deleted from `@kampus/sandbox`

- `RingBuffer` — CF handles output buffering
- `ManagedSession` output distribution fiber / client queues — DO just bridges WS
- Checkpoint/restore of terminal buffers — no terminal state in DO
- `SandboxLive` terminal wrapper complexity — replaced by thin WS bridge

## What stays / gets rewritten

- `WormholeHandler` — rewritten as plain TS, same channel framing protocol
- `ChannelMap` — stays, maps channels to ptyIds
- `Protocol.ts` — rewritten with Effect Schema, revised control messages
- `SandboxDO` — rewritten as WormholeServer DO

## Resolved Questions

1. **Channels on tab_switch:** All channels always. No per-tab channel scoping. Simpler protocol, instant tab switching.
2. **Limits:** Channel cap (254 total PTYs) is the only limit. No artificial caps on sessions/tabs/panes.
3. **Sandbox ID format:** Deferred — implementation detail.
4. **pane_resize target:** Explicit `{paneId, cols, rows}`. Not tied to focus.
5. **Initial dimensions on connect:** Client sends viewport size `{width, height}`. DO computes per-pane dimensions from layout proportions.
