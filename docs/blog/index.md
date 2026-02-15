# Building Wormhole: A 7+1 Part Build Journal

*Umut Sirin / February 2026*

A series about building a terminal multiplexer that lives at the
edge, survives infrastructure restarts, and follows you across
devices. Effect.ts on the backend, Cloudflare Workers and Durable
Objects at the edge, ghostty-web in the browser.

---

### [Why I'm Building My Own Terminal Multiplexer](2026-02-14-why-im-building-my-own-terminal-multiplexer.md)

*Umut Sirin / 2026-02-14*

tmux is local. mosh is single-session. VS Code Remote is an IDE.
Nothing gives you multiplexed terminals that live at the edge and
follow you across devices. This post lays out the itch, the
vision, and the stack.

**Topics**: wormhole, terminal-multiplexer, effect-ts,
cloudflare-workers

---

### [From Prototype to Package](2026-02-14-from-prototype-to-package.md)

*Umut Sirin / 2026-02-14*

The first version used Bun, which silently failed to wire up PTY
data events. After a 9-minute migration to Node, the real work
began: extracting a library with a clean Pty interface, a
RingBuffer, a Session multiplexer, and a fully mockable test
stack.

**Topics**: wormhole, effect-ts, package-extraction, bun-migration

---

### [A Binary Protocol for Terminal Multiplexing](2026-02-14-a-binary-protocol-for-terminal-multiplexing.md)

*Umut Sirin / 2026-02-14*

JSON is great until you are shipping raw terminal bytes at 60fps.
One byte of channel overhead per frame, with JSON reserved for
infrequent control messages. The protocol design, the ChannelMap,
and the lessons from over-engineering the first version.

**Topics**: wormhole, protocol-design, binary-protocol,
effect-schema

---

### [Running a PTY on Cloudflare's Edge](2026-02-14-running-a-pty-on-cloudflares-edge.md)

*Umut Sirin / 2026-02-14*

V8 isolates cannot load native addons. Cloudflare Sandbox gives
you a real PTY inside a container at the edge. Getting it to work
took 21 hours of wrong Docker images, wrong API calls, and wrong
assumptions. The Pty interface abstraction made the swap boring.

**Topics**: wormhole, cloudflare-sandbox, durable-objects,
edge-computing

---

### [When Your Fibers Die Silently](2026-02-14-when-your-fibers-die-silently.md)

*Umut Sirin / 2026-02-14*

The output fiber was forked as a child of an ephemeral handler
fiber. When the handler completed, Effect's structured concurrency
killed the child. Tests passed because the test fiber was
long-lived. The fix was one line: `Effect.forkDaemon`.

**Topics**: wormhole, effect-ts, fiber-lifecycle, debugging

---

### [Killing Your Abstractions](2026-02-14-killing-your-abstractions.md)

*Umut Sirin / 2026-02-14*

A bridge from Cloudflare WebSocket to Effect Socket created an
uninterruptible `await` buried three layers deep. Browser refresh
left zombie fibers holding dead connections. The fix was deleting
210 lines of elegant code and using native event listeners.

**Topics**: wormhole, effect-ts, cloudflare-workers,
architecture-decisions

---

### [Tiled Terminals in the Browser](2026-02-14-tiled-terminals-in-the-browser.md)

*Umut Sirin / 2026-02-14*

The frontend is where the protocol becomes the user experience. A
pure functional layout tree, a channel-based pub/sub gateway with
pre-mount buffering, ghostty-web integration, and the async state
machine that coordinates session creation with tree splits.

**Topics**: wormhole, react, layout-tree, ghostty-web,
frontend-architecture

---

### [Making Sessions Immortal](2026-02-14-making-sessions-immortal.md)

*Umut Sirin / 2026-02-14*

Sessions survive PTY death but not DO eviction. The plan for
true immortality: checkpoint to DO Storage via alarm(), hydrate
on wake, reconnection state machine that never gives up, and
layout persistence in localStorage. From "why build this" to
"it never dies."

**Topics**: wormhole, durable-objects, persistence, effect-ts
