# @kampus/wormhole-effect

Effect-native PTY multiplexer. Spawns pseudo-terminal processes and multiplexes their I/O across multiple WebSocket clients.

## Architecture

```
WebSocket Client A ──┐                    ┌── Queue A ──→ Client A
WebSocket Client B ──┤── Server ── Session ┤── Queue B ──→ Client B
WebSocket Client C ──┘       │        │    └── Queue C ──→ Client C
                        SessionStore  PTY
                                       │
                                    /bin/sh
```

**Key patterns:**

- `Context.Tag` for `Pty` — testable via Layer swap
- `Effect.Service` for `SessionStore` — singleton session lifecycle
- Queue-per-client fan-out — each attached client gets its own `Queue`
- `Scope`-managed PTY lifecycle — `Effect.acquireRelease` for spawn/kill
- `Stream.asyncPush` for bridging node-pty's sync callbacks into Effect streams
- `RingBuffer` for scrollback replay on client attach

## Modules

| Module | Purpose |
|--------|---------|
| `Pty` | `Context.Tag` + `PtyProcess` interface (output stream, write, resize, awaitExit) |
| `PtyLive` | Live `Layer` that spawns real PTY processes via `@lydell/node-pty` |
| `Session` | Multiplexer — one PTY, many clients. Attach/detach, scrollback replay, resize |
| `SessionStore` | `Effect.Service` managing session lifecycle with per-session `Scope` |
| `Protocol` | Schema-based WebSocket message types (attach, resize, session_list, session_new) |
| `Server` | `handleConnection` — bidirectional WS handler using `Effect.raceFirst` |
| `Errors` | `PtySpawnError`, `SessionNotFoundError` (`Schema.TaggedError`) |
| `RingBuffer` | Fixed-capacity circular buffer for PTY output (scrollback) |

## Usage

```ts
import * as SocketServer from "@effect/platform/SocketServer"
import {NodeContext, NodeRuntime, NodeSocketServer} from "@effect/platform-node"
import {PtyLive, Server, SessionStore} from "@kampus/wormhole-effect"
import {Console, Effect, Layer} from "effect"

const PORT = 8787

const program = Effect.gen(function* () {
  yield* Console.log(`wormhole listening on ws://0.0.0.0:${PORT}`)
  const server = yield* SocketServer.SocketServer
  yield* server.run(Server.handleConnection)
})

const WormholeLive = Layer.mergeAll(
  NodeSocketServer.layerWebSocket({port: PORT, host: "0.0.0.0"}),
  SessionStore.SessionStore.Default.pipe(Layer.provide(PtyLive)),
  NodeContext.layer,
)

program.pipe(Effect.provide(WormholeLive), NodeRuntime.runMain)
```

## Testing

```bash
pnpm --filter @kampus/wormhole-effect test
```

The `Pty` tag makes testing easy — swap `PtyLive` for a mock Layer:

```ts
const TestPty = Layer.succeed(Pty, {
  spawn: () => Effect.succeed(mockPtyProcess),
})
```

## WebSocket Protocol

**Client → Server:**

| Message | Fields | Description |
|---------|--------|-------------|
| `attach` | `sessionId`, `cols`, `rows` | Join/create a session (must be first message) |
| `resize` | `cols`, `rows` | Resize terminal |
| `session_list_request` | — | List active sessions |
| `session_new` | `cols`, `rows` | Create new session |
| *(raw text)* | — | Forwarded to PTY stdin |

**Server → Client:**

| Message | Fields | Description |
|---------|--------|-------------|
| `session` | `sessionId` | Confirms session attachment |
| `session_list` | `sessions[]` | List of `{id, clientCount}` |
| *(raw text)* | — | PTY stdout output |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `WORMHOLE_BUFFER_SIZE` | `102400` | Scrollback buffer capacity in bytes |
