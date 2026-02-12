# Wormhole Multiplexed Sessions: Requirements

## Functional Requirements

### FR-1: Binary Frame Protocol

All WebSocket messages use binary framing: `[channel: u8, ...payload]`.

| Aspect | Requirement |
|--------|-------------|
| Frame format | First byte = channel ID (0-255), rest = payload |
| Channel 255 | Control channel: JSON-encoded control messages |
| Channels 0-254 | Terminal I/O: raw bytes (PTY output downstream, user input upstream) |
| Direction | Bidirectional (same framing client-to-server and server-to-client) |

```
Client → Server:  [0x00, <user keystrokes for channel 0>]
Server → Client:  [0x00, <pty output for channel 0>]
Client → Server:  [0xFF, <JSON: {"type":"session_new","cols":80,"rows":24}>]
Server → Client:  [0xFF, <JSON: {"type":"session_opened","channel":0,"sessionId":"abc"}>]
```

### FR-2: Control Messages (Channel 255)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `session_new` | C→S | Request new terminal session, server assigns channel |
| `session_opened` | S→C | Confirm session creation with assigned channel + session ID |
| `session_attach` | C→S | Re-attach to existing session by ID |
| `session_close` | C→S | Close a terminal session |
| `session_closed` | S→C | Confirm session teardown, free channel |
| `resize` | C→S | Resize a specific channel's PTY |
| `session_list` | C→S / S→C | Request/response for active sessions |
| `error` | S→C | Error response with reason |

### FR-3: Channel Allocation

| Aspect | Requirement |
|--------|-------------|
| Pool | Channels 0-254 (255 reserved for control) |
| Allocation | Server assigns lowest available channel on `session_new` |
| Release | Channel returned to pool on `session_close` / `session_closed` |
| Exhaustion | `ChannelExhaustedError` when all 255 channels in use |
| Per-connection | Each WebSocket connection has its own channel map |

### FR-4: Per-User DO Routing

| Aspect | Requirement |
|--------|-------------|
| Current | `WormholeDO` addressed by arbitrary name (session-scoped) |
| New | `WormholeDO` addressed by authenticated user ID |
| Routing | `env.WORMHOLE.idFromName(userId)` |
| Auth | Extract user ID from request (session cookie / token) |
| Benefit | All sessions for a user live in one DO = reconnect works |

### FR-5: Frontend Tiled Layout

| Aspect | Requirement |
|--------|-------------|
| Library | `@usirin/layout-tree` for layout data structure |
| Rendering | Each leaf node = one `GhosttyTerminal` mapped to a channel |
| Split | User action creates `session_new`, adds leaf to layout tree |
| Close | User action sends `session_close`, removes leaf from tree |
| Resize | Container resize recalculates pane dimensions, sends `resize` per channel |

### FR-6: Session Persistence

| Aspect | Requirement |
|--------|-------------|
| Reconnect | Client sends `session_list` on connect, re-attaches to existing sessions |
| DO lifetime | DO stays alive as long as sessions exist (Cloudflare manages eviction) |
| Layout | Layout tree is client-side state; server only tracks sessions |

---

## Non-Functional Requirements

### NFR-1: Package Changes

```
packages/wormhole/src/
├── Protocol.ts          # UPDATE: add mux control messages
├── MuxProtocol.ts       # NEW: binary frame types + helpers
├── MuxServer.ts         # NEW: multiplexed connection handler
├── ChannelMap.ts        # NEW: channel allocation
├── Errors.ts            # UPDATE: add ChannelExhaustedError
├── Server.ts            # KEEP: backwards compatible
├── Session.ts           # KEEP: unchanged
├── SessionStore.ts      # KEEP: unchanged
└── ...
```

### NFR-2: Frontend Changes

```
apps/kamp-us/src/
├── pages/
│   └── Wormhole.tsx          # UPDATE: tiled layout
├── features/wormhole/
│   ├── WormholeGateway.ts    # NEW: React context for mux WebSocket
│   ├── useChannelTerminal.ts # NEW: hook binding channel ↔ terminal
│   ├── useWormholeLayout.ts  # NEW: hook for layout-tree state
│   ├── WormholeLayout.tsx    # NEW: recursive tiled layout component
│   └── TerminalPane.tsx      # NEW: single pane with terminal + controls
```

### NFR-3: Performance

- Binary framing adds 1 byte overhead per message (negligible)
- No JSON parsing on terminal I/O hot path
- Channel map operations are O(1) lookup, O(n) allocation (n <= 255)

### NFR-4: Backwards Compatibility

- Existing `/wormhole/:sessionId` route can remain as single-session mode
- New `/wormhole` route (no sessionId) enters multiplexed mode
