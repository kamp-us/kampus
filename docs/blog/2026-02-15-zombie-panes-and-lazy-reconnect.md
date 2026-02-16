---
title: "Zombie Panes and Lazy Reconnect"
date: 2026-02-15
author: Umut Sirin
topics:
  - wormhole
  - cloudflare-sandbox
  - reconnection
  - protocol-design
---

# Zombie Panes and Lazy Reconnect

![ctx](../images/ctx-banner.png)

> Your terminal looks alive. The cursor blinks. The prompt is
> there. You type a command and... nothing. The pane is a
> zombie.

## The Problem

Cloudflare Sandbox containers sleep after roughly 10 minutes
of inactivity. When they do, the terminal WebSocket connections
from the Durable Object to the sandbox die. The DO's close
handler fires, removes the terminal from `this.terminals`, and
sends a `session_exit` message to the frontend.

The frontend receives it. And does nothing:

```typescript
case "session_exit":
    break;
```

A no-op. The layout stays unchanged. The pane looks alive.
Every keystroke gets routed to a dead WebSocket and silently
dropped.

## The Diagnosis

The bug isn't that the sandbox sleeps. That's expected. The
bug is a split brain: the DO knew the terminal was dead (it
removed it from `this.terminals`), but the frontend had no
way to reflect that.

We were sending a `session_exit` message that the frontend
never handled. Even if it had, the message carried the wrong
semantics: "this session is gone." But the session isn't gone;
the sandbox fell asleep. The pane should stay; it needs to
wake up.

## Derive, Don't Store

Connection state doesn't need its own data structure.
`this.terminals.has(ptyId)` already IS the connection state.
A ptyId is connected if and only if there's a live WebSocket
in the map.

So we derive it:

```typescript
private buildConnectedRecord(): Record<string, boolean> {
    const channels = this.channelMap.toRecord();
    const connected: Record<string, boolean> = {};
    for (const ptyId of Object.keys(channels)) {
        connected[ptyId] = this.terminals.has(ptyId);
    }
    return connected;
}
```

This `connected` record rides alongside every `state` and
`layout_update` message: one more field derived from what we
already track.

On the frontend, panes get a `connected` prop. When false,
a disconnected overlay covers the terminal:

```tsx
{!connected && (
    <div className={styles.disconnectedOverlay}>
        <span>Disconnected — press any key to reconnect</span>
    </div>
)}
```

The terminal output stays visible underneath, preserved by
the output buffers we kept.

## The Trick: Keep the Channels

When a terminal WebSocket closes, the old code released the
channel mapping. The terminal is dead, free the channel. But
releasing creates a problem: the frontend is still sending
keystrokes on that channel number. After release, those
keystrokes have no ptyId mapping and get silently dropped.

Instead, we keep the channel assigned:

```
Sandbox sleeps
  -> terminal WS closes
  -> close handler: keep buffers, keep channel, broadcast
  -> client receives layout_update with connected[ptyId] = false
  -> TerminalPane renders "Disconnected" overlay

User presses key
  -> useChannelTerminal sends data on existing channel
  -> server: channelMap.getPtyId(channel) succeeds
  -> server: terminals.get(ptyId) = undefined
  -> server triggers reconnectTerminal(ptyId, payload)
  -> sandbox wakes, new PTY created, same channel kept
  -> broadcast layout_update with connected[ptyId] = true
  -> overlay disappears, terminal resumes
```

Every keystroke to a dead pane becomes a reconnect trigger.
No new protocol message. No "reconnect" button. No
client-side timer. The user just types, and the pane comes
back to life.

`channelMap.assign(ptyId)` is idempotent: if a channel is
already assigned, it returns the existing one. So reconnection
reuses the same channel. No remapping dance. The frontend
doesn't need special reconnect logic; it just sees `connected`
flip from false to true.

## What Code Review Caught

The automated review flagged something real: `reconnectTerminal`
used hardcoded 80x24 for the terminal dimensions. The layout
tree doesn't store pane sizes, and `handlePaneResize` only
forwards to the terminal WebSocket without persisting.

The fix was a `paneSizes` Map: an in-memory cache updated on
every split and resize, consulted on reconnect. It's lost on
DO hibernation, but so are the terminal WebSockets themselves.
The fallback to 80x24 only applies after a cold start, and the
next resize corrects it.

The review also caught that `handleSessionCreate` and
`handleTabCreate` both created terminals without saving to
`paneSizes`. Four call sites to `createTerminalWs`, and two
were missing the size tracking. We considered putting the
`paneSizes.set()` call inside `createTerminalWs` itself, but
the caller owns the dimensions, not the connection method.

## What Didn't Change

**No retry limit.** If a sandbox is permanently dead, every
keystroke triggers a reconnect attempt. This is wasteful but
self-correcting: the reconnect fails, the pane stays
disconnected, and the user eventually gives up or closes it.
A retry counter with exponential backoff is next.

**Fresh shell after sleep.** The old output stays visible
(from our output buffers), but the new prompt appears at the
bottom. Acceptable for now.

**Lost keystroke on reconnect failure.** The keystroke that
triggers the reconnect is buffered and sent after the new
WebSocket connects. If the reconnect fails, that keystroke is
gone. One character lost in a failure scenario: fine.

No automated test for sandbox sleep yet. We tested by killing
the terminal WebSocket manually and verifying the overlay
appears, then typing to trigger reconnect.

## The Deleted Code

We removed `SessionExitMessage` entirely from the protocol.
It was a message type that no one handled. The connection state
it tried to communicate is now implicit in the `connected`
field of every state broadcast.

Post 9 deleted 1,284 lines of custom infrastructure. This
post deleted a protocol message type. The pane goes grey. You
press a key. It comes back. That is the whole reconnect UX.
