# Wormhole Multiplexed Sessions: Design

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Browser                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │  WormholeLayout (layout-tree)                   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│  │  │ Pane ch0 │ │ Pane ch1 │ │ Pane ch2 │        │ │
│  │  │ ghostty  │ │ ghostty  │ │ ghostty  │        │ │
│  │  └──────────┘ └──────────┘ └──────────┘        │ │
│  └─────────────────────────────────────────────────┘ │
│         │              │              │               │
│  ┌──────┴──────────────┴──────────────┴────────────┐ │
│  │  WormholeGateway (single WebSocket)             │ │
│  │  Mux: [channel: u8, ...payload]                 │ │
│  └─────────────────────┬───────────────────────────┘ │
└────────────────────────┼─────────────────────────────┘
                         │ WSS
┌────────────────────────┼─────────────────────────────┐
│  Cloudflare Worker     │                              │
│  ┌─────────────────────┴───────────────────────────┐ │
│  │  WormholeDO (per-user, idFromName(userId))      │ │
│  │  ┌────────────────────────────────────────────┐ │ │
│  │  │  MuxServer                                 │ │ │
│  │  │  - demux incoming frames by channel        │ │ │
│  │  │  - mux outgoing frames with channel prefix │ │ │
│  │  │  - handle control channel (255) messages   │ │ │
│  │  │  - ChannelMap: channel ↔ session binding   │ │ │
│  │  └────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────┐ │ │
│  │  │  SessionStore (existing, unchanged)        │ │ │
│  │  │  - manages Session lifecycle               │ │ │
│  │  │  - each Session wraps a PTY process        │ │ │
│  │  └────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
│                         │                             │
│  ┌──────────────────────┴──────────────────────────┐ │
│  │  WormholeSandbox (Container / WorkerEntrypoint) │ │
│  │  PTY processes via @lydell/node-pty             │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Binary Frame Protocol

### Wire Format

Every WebSocket message is binary (`Uint8Array`):

```
┌─────────┬──────────────────────┐
│ byte 0  │ bytes 1..N           │
│ channel │ payload              │
├─────────┼──────────────────────┤
│ 0x00    │ raw terminal I/O     │
│ 0x01    │ raw terminal I/O     │
│ ...     │ ...                  │
│ 0xFE    │ raw terminal I/O     │
│ 0xFF    │ JSON control message │
└─────────┴──────────────────────┘
```

### Frame Helpers

```typescript
// packages/wormhole/src/MuxProtocol.ts

export const CONTROL_CHANNEL = 255 as const

export const frame = (channel: number, payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(1 + payload.byteLength)
  out[0] = channel
  out.set(payload, 1)
  return out
}

export const deframe = (data: Uint8Array): {channel: number; payload: Uint8Array} => ({
  channel: data[0],
  payload: data.subarray(1),
})
```

### Control Messages (Effect Schema)

```typescript
// Client → Server
export class MuxSessionNew extends Schema.Class<MuxSessionNew>("MuxSessionNew")({
  type: Schema.Literal("session_new"),
  cols: Schema.Number,
  rows: Schema.Number,
}) {}

export class MuxSessionAttach extends Schema.Class<MuxSessionAttach>("MuxSessionAttach")({
  type: Schema.Literal("session_attach"),
  sessionId: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
}) {}

export class MuxSessionClose extends Schema.Class<MuxSessionClose>("MuxSessionClose")({
  type: Schema.Literal("session_close"),
  channel: Schema.Number,
}) {}

export class MuxResize extends Schema.Class<MuxResize>("MuxResize")({
  type: Schema.Literal("resize"),
  channel: Schema.Number,
  cols: Schema.Number,
  rows: Schema.Number,
}) {}

// Server → Client
export class MuxSessionOpened extends Schema.Class<MuxSessionOpened>("MuxSessionOpened")({
  type: Schema.Literal("session_opened"),
  channel: Schema.Number,
  sessionId: Schema.String,
}) {}

export class MuxSessionClosed extends Schema.Class<MuxSessionClosed>("MuxSessionClosed")({
  type: Schema.Literal("session_closed"),
  channel: Schema.Number,
  sessionId: Schema.String,
}) {}
```

## Channel Map

Per-connection data structure mapping channels to sessions.

```typescript
// packages/wormhole/src/ChannelMap.ts

export interface ChannelMap {
  readonly allocate: (sessionId: string) => Effect<number, ChannelExhaustedError>
  readonly release: (channel: number) => Effect<void>
  readonly getSessionId: (channel: number) => Option<string>
  readonly getChannel: (sessionId: string) => Option<number>
  readonly entries: Effect<ReadonlyArray<{channel: number; sessionId: string}>>
}
```

Implementation: internal `Map<number, string>` + `Map<string, number>` (bidirectional). Allocate scans 0-254 for first free slot.

## MuxServer

Replaces `Server.handleConnection` for multiplexed mode.

```typescript
// packages/wormhole/src/MuxServer.ts

export const handleConnection: (
  socket: Socket.Socket,
) => Effect<void, Socket.SocketError, SessionStore>
```

Flow:
1. Read binary frame from socket
2. `deframe()` to get channel + payload
3. If channel = 255: parse JSON, dispatch control message handler
4. If channel 0-254: look up session in ChannelMap, forward payload as `session.write()`
5. For each session: pipe `session.output` through `frame(channel, chunk)` to socket

## Per-User DO Routing

### Current (per-session)

```typescript
// Worker route handler
const id = env.WORMHOLE.idFromName(sessionId)  // arbitrary
const stub = env.WORMHOLE.get(id)
```

### New (per-user)

```typescript
// Worker route handler (authenticated)
const userId = extractUserId(request)  // from auth cookie/token
const id = env.WORMHOLE.idFromName(userId)
const stub = env.WORMHOLE.get(id)
```

All of a user's sessions live in one DO instance. The DO's SessionStore manages multiple sessions. The MuxServer multiplexes them onto the WebSocket.

## Frontend Design

### WormholeGateway (React Context)

Manages the single WebSocket connection. Provides:
- `send(channel, data)` - send framed data
- `subscribe(channel, callback)` - receive demuxed data for a channel
- `sendControl(message)` - send control message on channel 255
- `onControl(callback)` - receive control messages

### useChannelTerminal Hook

Binds a ghostty-web terminal instance to a channel:
- Terminal output → `gateway.send(channel, data)`
- `gateway.subscribe(channel, data)` → terminal input
- Resize events → `gateway.sendControl({type: "resize", channel, cols, rows})`

### useWormholeLayout Hook

Manages `@usirin/layout-tree` state:
- `splitPane(direction)` → sends `session_new`, on `session_opened` adds leaf
- `closePane(channel)` → sends `session_close`, removes leaf
- Provides layout tree for rendering

### WormholeLayout Component

Recursive renderer for layout-tree:
- Branch node → flex container with children
- Leaf node → `<TerminalPane channel={channel} />`
- Drag handles between panes for resizing

## Design Decisions

### Why 1-byte channel, not varint?

255 concurrent terminals per connection is more than enough. 1 byte = simplest possible framing, zero parsing ambiguity, minimal overhead.

### Why client-side layout tree?

Server doesn't need to know about visual layout. It only tracks sessions. Layout is presentation concern. Client persists layout in localStorage if needed.

### Why per-user DO (not per-workspace)?

Simplest model. One user = one DO = one set of sessions. Multi-user workspaces are out of scope.

### Why keep existing Server.handleConnection?

Backwards compatibility. Single-session mode (existing `/wormhole/:sessionId` route) uses text-based protocol. Multiplexed mode uses binary protocol. Both can coexist.
