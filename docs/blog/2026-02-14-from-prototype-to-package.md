---
title: "From Prototype to Package"
date: 2026-02-14
author: Umut Sirin
series: "Building Wormhole"
part: 2
topics:
  - wormhole
  - effect-ts
  - package-extraction
  - bun-migration
---

# From Prototype to Package

The first version worked. Then I tried to deploy it.

Wormhole started as a single file: a WebSocket server that spawned a
PTY and piped bytes to a browser terminal. It ran on my machine, it
connected, the cursor blinked. I thought the hard part was over. It
was not.

## The Bun Disaster

The first prototype used `Bun.serve()`. Bun is fast, the DX is
great, and I wanted to like it for this project. The terminal
connected. The PTY spawned. The screen stayed blank.

No error. No warning. Just nothing.

I spent an embarrassing amount of time staring at this. The PTY
process was alive; I could verify that by checking the PID. The
WebSocket was open; the client received the connection event. But
the data events on the PTY never fired. The `onData` callback was
registered, the shell was running, and yet: silence.

The culprit turned out to be Bun's N-API compatibility shim. The
`@lydell/node-pty` package uses native addons, and Bun's N-API layer
silently failed to wire up the data event callbacks. The PTY
"worked" in the sense that it spawned a process, but the bridge
between the native addon and JavaScript was broken at the event
subscription level. No error was surfaced. The failure mode was
indistinguishable from "nothing happened yet."

The fix was obvious once I understood the cause: stop using Bun for
this server. The migration took about 9 minutes. Replace
`Bun.serve()` with `http.createServer` + `ws.WebSocketServer`. Swap
the deps, update the scripts. Everything worked immediately.

Lesson: when your runtime silently lies about I/O, switch runtimes.
There is no amount of debugging that fixes a compatibility shim that
fails without telling you it failed.

### The Ghost Socket

There was a bonus problem on macOS. After a crash during
development, port 3001 showed `LISTEN` in `netstat` but no PID in
`lsof`. A kernel-level ghost binding: the process was gone but the
port was still held. No amount of `kill` would fix it because there
was nothing to kill. I picked a different port and moved on. Some
fights are not worth having.

## Extracting @kampus/wormhole

Once I/O actually worked, the next problem was structural. All the
terminal logic lived in `apps/wormhole`, a monolith app in the
monorepo. That is fine for a prototype, but this code had a clear
domain boundary: PTY management, session multiplexing, scrollback
buffering, protocol framing. None of that belongs in an app
directory.

I extracted the library in five milestones, each one a buildable,
testable checkpoint.

### M1: The Pty Interface

The first thing to extract was the PTY abstraction. I wanted a
`Context.Tag` that described what a PTY can do without coupling to
any specific backend. This is the actual interface from commit
`75e0ca6`:

```typescript
export interface PtyProcess {
  readonly output: Stream.Stream<string>;
  readonly awaitExit: Effect.Effect<number>;
  readonly write: (data: string) => Effect.Effect<void>;
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
}

export class Pty extends Context.Tag("@kampus/wormhole/Pty")<
  Pty,
  {
    readonly spawn: (
      options: SpawnOptions,
    ) => Effect.Effect<PtyProcess, PtySpawnError, Scope.Scope>;
  }
>() {}
```

`PtyProcess` is a value you get back from spawning. It gives you a
`Stream` of output, a way to write input, resize the terminal, and
await the exit code. The `Pty` service itself only has one method:
`spawn`. And `spawn` requires a `Scope`, which means the PTY's
lifecycle is managed by whoever provides the scope. When the scope
closes, the PTY process is killed. No manual cleanup.

The live implementation (`PtyLive`) wraps `@lydell/node-pty` with
`Effect.acquireRelease`:

```typescript
const proc = yield* Effect.acquireRelease(
  Effect.try({
    try: () =>
      pty.spawn(shell, [...(options.args ?? [])], {
        name: "xterm-256color",
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd ?? homedir(),
        env: {
          ...(options.env ?? process.env),
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      }),
    catch: (cause) => new PtySpawnError({shell, cause}),
  }),
  (p) => Effect.sync(() => p.kill()),
);
```

The output stream uses `Stream.asyncPush` to bridge the callback
world of node-pty into Effect's pull-based streams:

```typescript
const output = Stream.asyncPush<string>((emit) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      proc.onData((data) => emit.single(data));
      proc.onExit(() => emit.end());
    }),
    () => Effect.void,
  ),
);
```

### M2: RingBuffer and Session

The RingBuffer is the simplest piece in the system, and I am
genuinely fond of it. It is a byte-capped circular buffer that
stores terminal output chunks. When a new client connects to an
existing session, they get the buffer contents replayed so they see
what is already on screen.

```typescript
export class RingBuffer {
  private entries: string[] = [];
  private totalBytes = 0;
  readonly capacity: number;

  push(data: string): void {
    const len = Buffer.byteLength(data);
    if (len > this.capacity) {
      const buf = Buffer.from(data);
      const truncated = buf
        .subarray(buf.length - this.capacity)
        .toString("utf-8");
      this.entries = [truncated];
      this.totalBytes = Buffer.byteLength(truncated);
      return;
    }
    this.entries.push(data);
    this.totalBytes += len;
    while (this.totalBytes > this.capacity && this.entries.length > 1) {
      const evicted = this.entries.shift();
      if (evicted === undefined) break;
      this.totalBytes -= Buffer.byteLength(evicted);
    }
  }

  snapshot(): string[] {
    return this.entries.slice();
  }
}
```

Key decision: byte-capped, not entry-capped. Terminal output chunks
vary wildly in size. A single `ls` in a large directory can produce
kilobytes in one chunk. Capping by entry count would either waste
memory or lose context. Byte capping with a 100KB default keeps
scrollback predictable.

The edge case that bit me: a single chunk larger than the buffer
capacity. The initial implementation just dropped it. The fix
truncates to the tail of the chunk, which preserves the most recent
output. This matters because a huge dump (like `cat`-ing a large
file) should leave you at the end, not with a blank buffer.

The Session module builds on top of RingBuffer. A Session owns one
PTY process and fans output to N clients. Each client gets an
unbounded `Queue`. When the PTY emits data, it goes into the
RingBuffer and into every client's queue:

```typescript
// Distribution fiber: PTY output -> buffer + all client queues
yield* proc.output.pipe(
  Stream.runForEach((data) =>
    Effect.gen(function* () {
      buffer.push(data);
      const map = yield* Ref.get(clients);
      yield* Effect.forEach(
        map.values(),
        (entry) => Queue.offer(entry.queue, data),
        { concurrency: "unbounded", discard: true },
      );
    }),
  ),
  Effect.forkIn(sessionScope),
);
```

When a new client attaches, they first get the buffer snapshot
replayed into their queue, then start receiving live data:

```typescript
const attach = (clientId: string, cols: number, rows: number) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<string>();

    for (const entry of buffer.snapshot()) {
      yield* Queue.offer(queue, entry);
    }

    yield* Ref.update(clients, (map) => {
      const next = new Map(map);
      next.set(clientId, {queue, cols, rows});
      return next;
    });
    yield* recomputeSize;

    const output = Stream.fromQueue(queue);
    const currentExited = yield* Ref.get(exitedRef);

    const close = Effect.gen(function* () {
      yield* Queue.shutdown(queue);
      yield* Ref.update(clients, (map) => {
        const next = new Map(map);
        next.delete(clientId);
        return next;
      });
      yield* recomputeSize;
    });

    return {output, exited: currentExited, close};
  });
```

This is the core multiplexing primitive. One PTY, many viewers,
each with their own backpressure-independent queue. The
`recomputeSize` call after attach and detach recalculates the
terminal dimensions as the minimum across all connected clients, so
the PTY output fits everyone's viewport.

### M3: SessionStore

SessionStore manages the lifecycle of sessions. Each session gets
its own `Scope.CloseableScope`, which means destroying a session
cleanly tears down the PTY, all client queues, and the distribution
fiber:

```typescript
export class SessionStore extends Effect.Service<SessionStore>()(
  "@kampus/wormhole/SessionStore",
  {
    effect: internal.make,
    dependencies: [],
  },
) {}
```

The internal implementation tracks sessions in a `Ref<Map>` and
provides `create`, `get`, `getOrFail`, `list`, `size`, and
`destroy`. The `destroy` method closes the session's scope, which
triggers the `acquireRelease` finalizer on the PTY:

```typescript
const destroy = (id: string) =>
  Effect.gen(function* () {
    const map = yield* Ref.get(entries);
    const entry = map.get(id);
    if (!entry) return;
    yield* Ref.update(entries, (m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    yield* Scope.close(entry.scope, Exit.void);
  });
```

No manual cleanup callbacks. No "don't forget to call dispose."
The scope hierarchy handles it.

### M4: Protocol and Server

The Protocol module defines the WebSocket message schema using
`Schema.Class` from Effect:

```typescript
export class AttachMessage extends Schema.Class<AttachMessage>(
  "AttachMessage",
)({
  type: Schema.Literal("attach"),
  sessionId: Schema.NullOr(Schema.String),
  cols: Schema.Number,
  rows: Schema.Number,
}) {}

export const ControlMessage = Schema.Union(
  AttachMessage,
  ResizeMessage,
  SessionListRequest,
  SessionNewRequest,
  // ...
);
```

Every message type is a tagged union member. Parsing is a one-liner
that returns `Option<ControlMessage>`. Invalid messages become
`Option.none()`, not thrown exceptions. The Server module wires
everything together: parse incoming messages, dispatch to
SessionStore, pipe session output back through the socket.

### M5: Integration

The final milestone reconnected `apps/wormhole` to the extracted
package. The app file shrunk to 22 lines:

```typescript
const program = Effect.gen(function* () {
  yield* Console.log(
    `wormhole listening on ws://0.0.0.0:${PORT}`
  );
  const server = yield* SocketServer.SocketServer;
  yield* server.run(Server.handleConnection);
});

const WormholeLive = Layer.mergeAll(
  NodeSocketServer.layerWebSocket({port: PORT, host: "0.0.0.0"}),
  SessionStore.SessionStore.Default.pipe(Layer.provide(PtyLive)),
  NodeContext.layer,
);

program.pipe(Effect.provide(WormholeLive), NodeRuntime.runMain);
```

The app knows three things: what port to listen on, that it needs
a `SessionStore` backed by a real PTY, and that it should run.
Everything else lives in the library.

## Test Infrastructure

I did not want tests that spawn real shell processes. Real shells
are slow, nondeterministic, and platform-dependent. So I built two
mock PTY variants.

`SimplePty` is for tests that just need a valid `Pty` service but
do not care about controlling output:

```typescript
export const SimplePty = Layer.succeed(Pty, {
  spawn: () =>
    Effect.gen(function* () {
      const outputQueue = yield* Queue.unbounded<string>();
      const exitDeferred = yield* Deferred.make<number>();
      return {
        output: Stream.fromQueue(outputQueue),
        awaitExit: Deferred.await(exitDeferred),
        write: () => Effect.void,
        resize: () => Effect.void,
      } satisfies PtyProcess;
    }),
});
```

`MockPty` exposes `PtyControls` via a `Ref` so tests can emit
output and trigger exits on demand:

```typescript
export function makeControlledPtyLayer(
  controlsRef: Ref.Ref<PtyControls | null>,
): Layer.Layer<Pty> {
  return Layer.succeed(Pty, {
    spawn: () =>
      Effect.gen(function* () {
        const inputQueue = yield* Queue.unbounded<string>();
        const outputQueue = yield* Queue.unbounded<string>();
        const exitDeferred = yield* Deferred.make<number>();

        yield* Ref.set(controlsRef, {
          emitOutput: (data) => Queue.offer(outputQueue, data),
          triggerExit: (code) =>
            Effect.all([
              Deferred.succeed(exitDeferred, code),
              Queue.shutdown(outputQueue),
            ]).pipe(Effect.asVoid),
          getInput: Queue.take(inputQueue),
        });

        return {
          output: Stream.fromQueue(outputQueue),
          awaitExit: Deferred.await(exitDeferred),
          write: (data) =>
            Queue.offer(inputQueue, data).pipe(Effect.asVoid),
          resize: () => Effect.void,
        } satisfies PtyProcess;
      }),
  });
}
```

Tests compose these into full stacks with one line:

```typescript
export const SimpleSessionStore = SessionStore.Default.pipe(
  Layer.provide(SimplePty),
);
```

Then a test looks like this:

```typescript
it.scoped(
  "clientCount reflects attached clients",
  () =>
    Effect.gen(function* () {
      const session = yield* makeSession({
        id: "s1", cols: 80, rows: 24,
      });
      expect(yield* session.clientCount).toBe(0);

      const h1 = yield* session.attach("c1", 80, 24);
      expect(yield* session.clientCount).toBe(1);

      yield* h1.close;
      expect(yield* session.clientCount).toBe(0);
    }).pipe(Effect.provide(SimplePty)),
);
```

No process spawning. No shell startup latency. No flaky CI from
`zsh` printing unexpected prompts. The `Context.Tag` abstraction
pays for itself immediately at test time.

## The Git Trail

Here is the commit history for the extraction. Each commit maps to
a milestone:

```
bc1b220 chore: scaffold @kampus/wormhole-effect package
75e0ca6 feat(wormhole-effect): add Pty Context.Tag and PtyProcess interface
689f56a feat(wormhole-effect): implement PtyLive with acquireRelease + Stream.asyncPush
83a842f feat(wormhole-effect): port RingBuffer with tests
8194a34 feat(wormhole-effect): implement Session multiplexer with Queue-per-client fan-out
424eaf6 feat(wormhole-effect): implement SessionStore with per-session Scope
6031b64 feat(wormhole-effect): M4 complete — Protocol + Server modules
09d84d6 feat(wormhole): M5 complete — integration with apps/wormhole
95dd6c6 refactor: rename @kampus/wormhole-effect → @kampus/wormhole
```

The package started as `@kampus/wormhole-effect` because the
original app already claimed the `wormhole` name. Once the
migration was complete and the old code was gone, the rename was a
single commit.

## What I Learned

Two lessons from this phase.

First: when your runtime silently lies, switch runtimes. Bun's
N-API shim swallowed the failure completely. I could have spent
days trying to debug event subscription internals in a
compatibility layer I do not control. Instead, I spent 9 minutes
migrating to Node's `http` + `ws`. The prototype existed to prove
the concept, not to prove loyalty to a runtime.

Second: when your code has a clear domain, extract the library
early. The monolith-to-package refactor was straightforward because
I did it while the codebase was still small. Every week I delayed
would have added coupling. The `Pty` tag, the `Session`
multiplexer, the `RingBuffer`, the `Protocol` schema: these are
domain concepts, not app concerns. They belonged in a package from
the start. I just needed the prototype to show me where the
boundaries were.

Next post: multiplexing. One WebSocket, many terminal sessions,
binary framing, and the `ChannelMap` that ties them together.
