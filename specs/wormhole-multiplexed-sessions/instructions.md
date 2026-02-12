# Wormhole Multiplexed Sessions: Instructions

## Feature Overview

Evolve wormhole from single-session-per-WebSocket to multiplexed terminal sessions over a single connection. Users get tiled terminal panes in the browser (tmux-like) with session persistence across reconnects.

### Why

Current wormhole: 1 WebSocket = 1 session = 1 terminal. To support multiple panes:
- Opening N WebSockets is wasteful and complex
- No shared control plane between terminals
- No way to manage layout server-side

New approach: 1 WebSocket carries N terminal channels via 1-byte binary framing. Channel 255 = JSON control messages. Channels 0-254 = raw terminal I/O.

## User Stories

**As a user**, I want to:

1. **Split terminal** - Open new panes (horizontal/vertical split) without new connections
2. **See tiled layout** - Multiple terminals arranged in a resizable tiled grid
3. **Reconnect and resume** - Close browser, reopen, get my sessions back
4. **Close individual panes** - Kill one terminal without affecting others

**As a developer**, I want to:

1. **Per-user DO routing** - Each user gets one WormholeDO instance (not per-session)
2. **Binary protocol** - Minimal overhead multiplexing, no JSON parsing on hot path
3. **Layout tree** - `@usirin/layout-tree` manages pane arrangement

## Acceptance Criteria

- [ ] Binary framing: `[channel: u8, ...payload]` for all WebSocket messages
- [ ] Channel 255 carries JSON control messages (session_new, session_attach, resize, etc.)
- [ ] Channels 0-254 carry raw terminal I/O (PTY output / user input)
- [ ] Per-user DO routing via authenticated user ID
- [ ] Frontend renders tiled panes using `@usirin/layout-tree`
- [ ] Session persistence: reconnect re-attaches to existing sessions
- [ ] Existing single-terminal flow still works (backwards compatible route)

## Constraints

- Max 255 concurrent terminal channels per connection
- Binary frames only (no mixed text/binary on same channel)
- `@usirin/layout-tree` is an external dependency (npm package)
- ghostty-web (WASM terminal) is the terminal emulator
- PTY runs in sandbox Worker (existing `PtySandbox` / `WormholeSandbox`)

## Dependencies

| Package | Role |
|---------|------|
| `@kampus/wormhole` | Protocol, Server, Session, SessionStore, Pty |
| `@kampus/ghostty-react` | React wrapper for ghostty-web terminal |
| `@usirin/layout-tree` | Tiled layout tree data structure |
| `@effect/platform` | Socket abstraction |
| `effect` | Core |

## Out of Scope

- Shared/collaborative sessions (multi-user same terminal)
- Terminal scrollback persistence (DO storage)
- Custom shell selection UI
- Tab-based (non-tiled) layout
