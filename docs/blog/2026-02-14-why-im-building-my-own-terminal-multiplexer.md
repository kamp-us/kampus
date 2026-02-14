---
title: "Why I'm Building My Own Terminal Multiplexer"
date: 2026-02-14
author: Umut Sirin
series: "Building Wormhole"
part: 1
topics:
  - wormhole
  - terminal-multiplexer
  - effect-ts
  - cloudflare-workers
---

# Why I'm Building My Own Terminal Multiplexer

You have tmux. You have mosh. Why build another one?

Because I want a terminal that follows me everywhere and
forgets nothing. And nothing out there does that.

## The itch

I spent the first five years of my career building cloud
development environments at [Koding][koding]. The terminal
was always the hardest part to get right. Not the rendering,
not the escape sequence parsing: the lifecycle. Making a
remote shell feel like it lives on your machine, surviving
every interruption the network and the infrastructure can
throw at it.

That itch never went away. I still SSH into boxes, lose
sessions when my laptop sleeps, and re-create my pane layout
every time I switch devices. I want sessions that survive
everything: device switches, network drops, server restarts,
deploys. I want to open my phone, see the same terminals I
left on my desktop, pick up where I left off.

Nothing gives me that today.

## What exists and where it falls short

**tmux** is the gold standard for terminal multiplexing, and
I use it daily. But it is local. My tmux sessions live on
one machine. If I want them on another device, I need SSH
into that machine, and if that machine reboots, my sessions
are gone. tmux solves multiplexing; it does not solve
mobility or persistence.

**mosh** solves the network problem beautifully. It predicts
keystrokes, survives roaming, handles UDP intelligently. But
it gives you exactly one session. No splits, no tabs, no
multiplexing. You end up running mosh into a box and then
tmux inside mosh, which is two layers of session management
that do not talk to each other.

**VS Code Remote** is the closest thing to what I want in
spirit. It gives you a remote environment with terminals in
the browser. But it is heavy, opinionated, and not
composable. You get VS Code or you get nothing. I do not
want an IDE; I want a terminal.

**Eternal Terminal** improves on mosh with reconnection and
scrollback. It is genuinely good. But it is still one
session per connection, still no multiplexing, still tied to
a single server.

Every tool solves one piece. None of them solve the whole
problem: multiplexed terminals that live on the edge, follow
you across devices, and survive infrastructure restarts.

## The vision

The project is called **wormhole**. The idea: your terminals
live at the edge, not on any single machine. You connect
from any device, any browser, and your sessions are there.
You disconnect, your sessions keep running. The server
restarts, your sessions come back. You open a new tab on
your phone, same terminals.

The architecture is Effect.ts on the backend, Cloudflare
Workers and Durable Objects at the edge, and ghostty-web in
the browser.

## The stack and why each piece

### Effect.ts

A terminal multiplexer is a concurrency problem. You have
PTY processes producing output, multiple clients consuming
it, sessions being created and destroyed, fibers that need
to be interrupted cleanly when a session exits. The question
is not "can I manage this state" but "can I manage it
without losing my mind."

Effect.ts gives me structured concurrency with typed errors
and service composition. Every PTY gets a scope. Every fiber
has an owner. When a session dies, its scope closes, and all
its fibers get interrupted: the output distribution fiber,
the exit watcher fiber, the client queues. No leaked
goroutines, no orphan timers, no "I forgot to clean up that
listener."

The service pattern also matters. `Pty` is a service tag.
In production, it spawns a real process inside a Cloudflare
Sandbox. In tests, it is a mock that gives me fine-grained
control over output and exit timing. Same code, different
layers. This is how I can write resurrection tests that kill
a PTY, verify the session survives, reattach, and confirm
the new shell works: all deterministic, no flaky timeouts.

### Cloudflare Workers + Durable Objects

A Durable Object is a single-threaded, stateful instance
that Cloudflare runs at the edge. One per user. It holds
your sessions in memory, routes WebSocket messages, and
persists state to durable storage.

This is a perfect fit. Each user gets an isolated terminal
server with no traditional infrastructure to manage. No VMs,
no Kubernetes, no SSH keys. The DO wakes when you connect,
sleeps when you leave, and can serialize session state
before eviction so your sessions survive even infrastructure
restarts.

### Cloudflare Sandbox

Cloudflare recently shipped containers at the edge with a
`terminal()` API that gives you a real PTY inside a
sandboxed environment. This is the piece that was missing.
Before Sandbox, running a shell on Cloudflare was not
possible. Now a DO can spawn a container, get a PTY handle,
and pipe bytes through a WebSocket to the browser.

### ghostty-web

Mitchell Hashimoto's terminal emulator, compiled to
WebAssembly. This is not xterm.js. It is a real terminal
with GPU-accelerated rendering via WebGL, proper font
shaping, and the same codebase that runs natively on macOS
and Linux. The rendering quality difference is visible.

For a project where the terminal is the entire UI, rendering
quality matters. ghostty-web treats the browser as a real
platform, not an afterthought.

### Binary mux protocol

The multiplexing protocol is deliberately minimal. Every
WebSocket message is a binary frame: one byte for the
channel ID, then the payload. Channels 0 through 254 carry
raw terminal I/O, one channel per session. Channel 255
carries JSON control messages: session creation, attach,
detach, resize, destroy.

One byte of overhead on the hot path. Control messages are
infrequent and benefit from schema validation via Effect
Schema. Terminal I/O is high-throughput and must stay cheap.
This split keeps the common case fast and the uncommon case
safe.

## What this series will cover

This is the first post in a seven-part build journal:

1. **Why I'm building my own terminal multiplexer** (this
   post)
2. **From prototype to package**: extracting the library
3. **Binary protocol design**: the mux framing layer
4. **Running a PTY on Cloudflare's edge**: Sandbox, DOs,
   and the lifecycle
5. **Fiber lifecycle debugging**: the hardest bugs I hit
6. **Killing abstractions that fight the platform**: what I
   threw away and why
7. **Tiled terminals in the browser**: layout, ghostty-web,
   and the frontend

Each post will pull from real commits and real debugging
sessions. I will show the failures alongside the solutions,
because the failures are where the lessons live.

## Why now

Cloud development environments are having a moment.
Codespaces, Gitpod, Devpod, Railway: everyone is building
remote dev tooling. But the terminal layer in all of these
is an afterthought: an embedded xterm.js panel, a single
session, no real multiplexing.

The terminal deserves better. It is the most universal
interface in software development, and it has been
under-served in the browser for decades.

Sometimes the right tool doesn't exist yet.

[koding]: https://github.com/koding/koding
