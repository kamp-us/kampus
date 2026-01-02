# Research: graphql-ws Integration with Cloudflare Durable Objects

## Executive Summary

This document explores how to integrate the `graphql-ws` library with Cloudflare Durable Objects while maintaining hibernation support. The goal is to reuse as much battle-tested code as possible from `graphql-ws` without compromising the cost and scalability benefits of hibernatable WebSockets.

**Key Finding:** We can reuse ~60% of graphql-ws (message types, parsing, validation, close codes) while implementing our own state management layer that supports hibernation.

---

## Table of Contents

1. [The Challenge](#the-challenge)
2. [graphql-ws Architecture Analysis](#graphql-ws-architecture-analysis)
3. [What We Can Reuse](#what-we-can-reuse)
4. [What We Must Implement](#what-we-must-implement)
5. [Proposed Architecture](#proposed-architecture)
6. [Implementation Sketch](#implementation-sketch)
7. [Migration Path](#migration-path)
8. [Trade-offs](#trade-offs)

---

## The Challenge

### Hibernatable WebSockets

Cloudflare's Hibernatable WebSocket API allows Durable Objects to "sleep" while maintaining WebSocket connections:

```typescript
// Traditional WebSocket (stays in memory)
socket.on('message', (data) => { /* handle */ });

// Hibernatable WebSocket (handler method, DO can sleep between calls)
async webSocketMessage(ws: WebSocket, message: string) {
  // DO wakes up, handles message, can sleep again
}
```

**Benefits:**
- Significantly reduced costs for idle connections
- Better resource utilization
- Automatic scaling

**Constraint:**
- State must be externalized (can't live in memory)
- We use `ws.serializeAttachment()` / `ws.deserializeAttachment()` for per-connection state

### graphql-ws State Management

The `makeServer` function from graphql-ws maintains internal state per connection:

```typescript
// Inside makeServer's opened() method
const ctx = {
  connectionInitReceived: false,  // Has client sent connection_init?
  acknowledged: false,            // Have we sent connection_ack?
  subscriptions: {},              // Active subscriptions: id -> AsyncIterator
  extra,                          // User-provided context
};
```

This state lives in JavaScript memory and is lost when the DO hibernates.

### The Incompatibility

```
┌─────────────────────────────────────────────────────────────────┐
│                     graphql-ws makeServer                       │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Protocol-compliant message handling                         │
│  ✓ Built-in validation                                         │
│  ✓ Subscription lifecycle management                           │
│  ✗ State stored in memory (lost on hibernation)                │
│  ✗ Expects persistent event listeners (socket.on)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               Cloudflare Hibernatable WebSockets                │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Cost-efficient for idle connections                         │
│  ✓ State survives via serializeAttachment()                    │
│  ✓ Handler methods (webSocketMessage, webSocketClose)          │
│  ✗ No persistent event loop                                    │
│  ✗ DO instance may be different between messages               │
└─────────────────────────────────────────────────────────────────┘
```

---

## graphql-ws Architecture Analysis

### Exports We Can Use

```typescript
// From 'graphql-ws'
import {
  // Enums
  MessageType,        // 'connection_init', 'subscribe', 'next', etc.
  CloseCode,          // 4400, 4401, 4408, 4429, etc.

  // Utilities
  parseMessage,       // Parse incoming WebSocket data
  stringifyMessage,   // Serialize outgoing messages
  validateMessage,    // Validate message structure

  // Types
  ConnectionInitMessage,
  ConnectionAckMessage,
  SubscribeMessage,
  NextMessage,
  ErrorMessage,
  CompleteMessage,
  PingMessage,
  PongMessage,
  Message,            // Union of all message types
  SubscribePayload,
} from 'graphql-ws';
```

### MessageType Enum

```typescript
export enum MessageType {
  ConnectionInit = 'connection_init',  // Client → Server
  ConnectionAck = 'connection_ack',    // Server → Client
  Ping = 'ping',                       // Bidirectional
  Pong = 'pong',                       // Bidirectional
  Subscribe = 'subscribe',             // Client → Server
  Next = 'next',                       // Server → Client
  Error = 'error',                     // Server → Client
  Complete = 'complete',               // Bidirectional
}
```

### CloseCode Enum

```typescript
export enum CloseCode {
  InternalServerError = 4500,
  InternalClientError = 4005,
  BadRequest = 4400,
  BadResponse = 4004,
  Unauthorized = 4401,
  Forbidden = 4403,
  SubprotocolNotAcceptable = 4406,
  ConnectionInitialisationTimeout = 4408,
  ConnectionAcknowledgementTimeout = 4504,
  SubscriberAlreadyExists = 4409,
  TooManyInitialisationRequests = 4429,
}
```

### Message Parsing

```typescript
// parseMessage handles JSON parsing and basic validation
const message = parseMessage(rawData);

// stringifyMessage handles serialization
const data = stringifyMessage({ type: MessageType.ConnectionAck });

// validateMessage provides detailed validation
validateMessage(message); // throws if invalid
```

---

## What We Can Reuse

### 1. Message Types and Enums (100% reusable)

Replace our hand-written types with graphql-ws exports:

```typescript
// Before (our code)
interface SubscribeMessage {
  type: "subscribe";
  id: string;
  payload: {
    query: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
}

// After (from graphql-ws)
import type { SubscribeMessage } from 'graphql-ws';
```

### 2. Message Parsing and Validation (100% reusable)

Replace our JSON.parse with graphql-ws utilities:

```typescript
// Before (our code)
let parsed: ClientMessage;
try {
  parsed = JSON.parse(message);
} catch {
  this.closeWithError(ws, 4400, "Invalid JSON");
  return;
}

// After (using graphql-ws)
import { parseMessage, CloseCode } from 'graphql-ws';

let parsed: Message;
try {
  parsed = parseMessage(message);
} catch (err) {
  ws.close(CloseCode.BadRequest, err.message);
  return;
}
```

### 3. Close Codes (100% reusable)

Replace magic numbers with semantic constants:

```typescript
// Before
ws.close(4429, "Too many initialisation requests");
ws.close(4408, "Connection initialisation timeout");
ws.close(4401, "Unauthorized");

// After
import { CloseCode } from 'graphql-ws';

ws.close(CloseCode.TooManyInitialisationRequests, "Too many initialisation requests");
ws.close(CloseCode.ConnectionInitialisationTimeout, "Connection initialisation timeout");
ws.close(CloseCode.Unauthorized, "Unauthorized");
```

### 4. Message Serialization (100% reusable)

```typescript
// Before
ws.send(JSON.stringify({ type: "connection_ack" }));
ws.send(JSON.stringify({
  id: subscriptionId,
  type: "next",
  payload: { data: { channel: event } },
}));

// After
import { stringifyMessage, MessageType } from 'graphql-ws';

ws.send(stringifyMessage({ type: MessageType.ConnectionAck }));
ws.send(stringifyMessage({
  id: subscriptionId,
  type: MessageType.Next,
  payload: { data: { channel: event } },
}));
```

---

## What We Must Implement

### 1. Hibernation-Compatible State Management

The connection state must be serializable and stored via `serializeAttachment()`:

```typescript
import type { RateLimitState } from './types';

// State that survives hibernation
interface HibernatableConnectionState {
  // Protocol state
  phase: 'awaiting_init' | 'ready';
  connectedAt: number;

  // User identity (set after connection_init)
  userId?: string;

  // Active subscriptions: channel name -> subscription ID
  subscriptions: Record<string, string>;

  // Rate limiting
  rateLimit: RateLimitState;
}
```

### 2. Message Router

Route incoming messages to handlers based on type:

```typescript
import { parseMessage, MessageType, CloseCode } from 'graphql-ws';

async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer) {
  if (typeof rawMessage !== 'string') {
    ws.close(CloseCode.BadRequest, 'Binary messages not supported');
    return;
  }

  let message: Message;
  try {
    message = parseMessage(rawMessage);
  } catch (err) {
    ws.close(CloseCode.BadRequest, err.message);
    return;
  }

  const state = ws.deserializeAttachment() as HibernatableConnectionState;

  switch (message.type) {
    case MessageType.ConnectionInit:
      return this.handleConnectionInit(ws, message, state);
    case MessageType.Subscribe:
      return this.handleSubscribe(ws, message, state);
    case MessageType.Complete:
      return this.handleComplete(ws, message, state);
    case MessageType.Ping:
      ws.send(stringifyMessage({ type: MessageType.Pong }));
      return;
    case MessageType.Pong:
      // Client responded to our ping, clear timeout if any
      return;
    default:
      ws.close(CloseCode.BadRequest, 'Unknown message type');
  }
}
```

### 3. Channel-Based Subscription Handler

Instead of executing GraphQL operations (which would require a schema), we handle channel subscriptions:

```typescript
import {
  MessageType,
  CloseCode,
  stringifyMessage,
  type SubscribeMessage
} from 'graphql-ws';

private handleSubscribe(
  ws: WebSocket,
  message: SubscribeMessage,
  state: HibernatableConnectionState
) {
  if (state.phase !== 'ready') {
    ws.close(CloseCode.Unauthorized, 'Connection not acknowledged');
    return;
  }

  // Extract channel from query (our custom convention)
  const channelName = this.extractChannelName(message.payload.query);
  if (!channelName) {
    ws.send(stringifyMessage({
      id: message.id,
      type: MessageType.Error,
      payload: [{ message: 'Invalid subscription: must specify channel' }],
    }));
    return;
  }

  // Validate channel
  if (!ALLOWED_CHANNELS.has(channelName)) {
    ws.send(stringifyMessage({
      id: message.id,
      type: MessageType.Error,
      payload: [{ message: `Unknown channel: ${channelName}` }],
    }));
    return;
  }

  // Register subscription
  const newState: HibernatableConnectionState = {
    ...state,
    subscriptions: { ...state.subscriptions, [channelName]: message.id },
  };
  ws.serializeAttachment(newState);
}
```

### 4. Event Publishing

Publishing uses graphql-ws message types:

```typescript
import { stringifyMessage, MessageType } from 'graphql-ws';

async publish(channel: string, event: ChannelEvent) {
  const webSockets = this.ctx.getWebSockets();

  for (const ws of webSockets) {
    try {
      const state = ws.deserializeAttachment() as HibernatableConnectionState;

      if (state.phase === 'ready') {
        const subscriptionId = state.subscriptions[channel];
        if (subscriptionId) {
          ws.send(stringifyMessage({
            id: subscriptionId,
            type: MessageType.Next,
            payload: { data: { channel: event } },
          }));
        }
      }
    } catch (error) {
      console.error('[UserChannel] Failed to send:', error);
    }
  }
}
```

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    graphql-ws (npm package)                     │
├─────────────────────────────────────────────────────────────────┤
│  MessageType    CloseCode    parseMessage    stringifyMessage   │
│  Message types  SubscribePayload  validateMessage               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ imports
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              HibernatableGraphQLWSAdapter                       │
│              (our implementation)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              State Management Layer                      │   │
│  │  • serializeAttachment() / deserializeAttachment()      │   │
│  │  • HibernatableConnectionState type                     │   │
│  │  • Rate limiting state                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Message Router                              │   │
│  │  • webSocketMessage() handler                           │   │
│  │  • Uses parseMessage() from graphql-ws                  │   │
│  │  • Routes to protocol handlers                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Protocol Handlers                           │   │
│  │  • handleConnectionInit()                               │   │
│  │  • handleSubscribe()                                    │   │
│  │  • handleComplete()                                     │   │
│  │  • Uses stringifyMessage() from graphql-ws             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Channel Pub/Sub                             │   │
│  │  • publish(channel, event)                              │   │
│  │  • Channel validation                                   │   │
│  │  • Subscription registry (in attachment state)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Durable Object                          │
│              (UserChannel)                                      │
├─────────────────────────────────────────────────────────────────┤
│  • Hibernatable WebSocket handlers                              │
│  • Per-user isolation via idFromName()                         │
│  • RPC methods for publishing                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Sketch

### File Structure

```
apps/worker/src/features/user-channel/
├── UserChannel.ts              # Durable Object class
├── protocol.ts                 # graphql-ws integration layer
├── state.ts                    # Hibernatable state types
├── handlers/
│   ├── connection-init.ts      # connection_init handler
│   ├── subscribe.ts            # subscribe handler
│   └── complete.ts             # complete handler
└── types.ts                    # Channel event types
```

### protocol.ts

```typescript
import {
  parseMessage,
  stringifyMessage,
  MessageType,
  CloseCode,
  type Message,
  type ConnectionInitMessage,
  type SubscribeMessage,
  type CompleteMessage,
} from 'graphql-ws';

import type { HibernatableConnectionState } from './state';

export { MessageType, CloseCode, stringifyMessage };

/**
 * Parse and validate an incoming WebSocket message.
 * Uses graphql-ws parseMessage for protocol compliance.
 */
export function parseClientMessage(rawMessage: string): Message {
  return parseMessage(rawMessage);
}

/**
 * Create initial connection state for a new WebSocket.
 */
export function createInitialState(): HibernatableConnectionState {
  const now = Date.now();
  return {
    phase: 'awaiting_init',
    connectedAt: now,
    subscriptions: {},
    rateLimit: { windowStart: now, messageCount: 0 },
  };
}

/**
 * Check if connection_init was received within timeout.
 */
export function isConnectionInitTimedOut(
  state: HibernatableConnectionState,
  timeoutMs: number = 10_000
): boolean {
  return state.phase === 'awaiting_init' &&
         Date.now() - state.connectedAt > timeoutMs;
}

/**
 * Send a protocol-compliant error and close the connection.
 */
export function closeWithError(
  ws: WebSocket,
  code: CloseCode,
  reason: string
): void {
  ws.close(code, reason);
}

/**
 * Send a subscription error message.
 */
export function sendSubscriptionError(
  ws: WebSocket,
  id: string,
  message: string
): void {
  ws.send(stringifyMessage({
    id,
    type: MessageType.Error,
    payload: [{ message }],
  }));
}

/**
 * Send a subscription data message.
 */
export function sendNext<T>(
  ws: WebSocket,
  id: string,
  data: T
): void {
  ws.send(stringifyMessage({
    id,
    type: MessageType.Next,
    payload: { data },
  }));
}

/**
 * Send connection acknowledgement.
 */
export function sendConnectionAck(ws: WebSocket): void {
  ws.send(stringifyMessage({ type: MessageType.ConnectionAck }));
}

/**
 * Send pong in response to ping.
 */
export function sendPong(ws: WebSocket): void {
  ws.send(stringifyMessage({ type: MessageType.Pong }));
}
```

### state.ts

```typescript
/**
 * Rate limiting state for a connection.
 */
export interface RateLimitState {
  windowStart: number;
  messageCount: number;
}

/**
 * Connection state that survives hibernation.
 * Stored via ws.serializeAttachment().
 */
export interface HibernatableConnectionState {
  /** Protocol phase */
  phase: 'awaiting_init' | 'ready';

  /** Timestamp when connection was established */
  connectedAt: number;

  /** User ID (set after successful connection_init) */
  userId?: string;

  /** Active subscriptions: channel name -> subscription ID */
  subscriptions: Record<string, string>;

  /** Rate limiting state */
  rateLimit: RateLimitState;
}

/**
 * Serialize state to WebSocket attachment.
 */
export function saveState(ws: WebSocket, state: HibernatableConnectionState): void {
  ws.serializeAttachment(state);
}

/**
 * Deserialize state from WebSocket attachment.
 */
export function loadState(ws: WebSocket): HibernatableConnectionState {
  return ws.deserializeAttachment() as HibernatableConnectionState;
}
```

### UserChannel.ts (Updated)

```typescript
import { DurableObject } from 'cloudflare:workers';
import { MessageType, CloseCode } from 'graphql-ws';
import {
  parseClientMessage,
  createInitialState,
  isConnectionInitTimedOut,
  closeWithError,
  sendConnectionAck,
  sendPong,
  sendNext,
  sendSubscriptionError,
} from './protocol';
import {
  type HibernatableConnectionState,
  saveState,
  loadState,
} from './state';
import { handleSubscribe } from './handlers/subscribe';
import { handleComplete } from './handlers/complete';
import type { ChannelEvent } from './types';

const ALLOWED_CHANNELS = new Set(['library', 'notifications']);
const RATE_LIMIT = { WINDOW_MS: 60_000, MAX_MESSAGES: 100 };

export class UserChannel extends DurableObject<Env> {
  private ownerId: string | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ownerId = await this.ctx.storage.get<string>('owner');
    });
  }

  async setOwner(userId: string): Promise<void> {
    if (this.ownerId) return;
    this.ownerId = userId;
    await this.ctx.storage.put('owner', userId);
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const protocol = request.headers.get('Sec-WebSocket-Protocol');
    if (protocol !== 'graphql-transport-ws') {
      return new Response('Unsupported protocol', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    saveState(server, createInitialState());

    return new Response(null, {
      status: 101,
      headers: { 'Sec-WebSocket-Protocol': 'graphql-transport-ws' },
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== 'string') {
      closeWithError(ws, CloseCode.BadRequest, 'Binary messages not supported');
      return;
    }

    // Parse message using graphql-ws
    let message;
    try {
      message = parseClientMessage(rawMessage);
    } catch (err) {
      closeWithError(ws, CloseCode.BadRequest, (err as Error).message);
      return;
    }

    const state = loadState(ws);

    // Rate limiting
    const updatedRateLimit = this.checkRateLimit(state.rateLimit);
    if (!updatedRateLimit) {
      closeWithError(ws, CloseCode.TooManyInitialisationRequests, 'Rate limit exceeded');
      return;
    }
    saveState(ws, { ...state, rateLimit: updatedRateLimit });

    // Route by message type
    switch (message.type) {
      case MessageType.ConnectionInit:
        await this.handleConnectionInit(ws, state);
        break;

      case MessageType.Subscribe:
        handleSubscribe(ws, message, state, ALLOWED_CHANNELS);
        break;

      case MessageType.Complete:
        handleComplete(ws, message, state);
        break;

      case MessageType.Ping:
        sendPong(ws);
        break;

      case MessageType.Pong:
        // Client pong received - could clear timeout if we implement ping
        break;

      default:
        closeWithError(ws, CloseCode.BadRequest, 'Unknown message type');
    }
  }

  async webSocketClose(): Promise<void> {
    // Cleanup handled automatically by Cloudflare
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('[UserChannel] WebSocket error:', error);
  }

  private async handleConnectionInit(
    ws: WebSocket,
    state: HibernatableConnectionState
  ): Promise<void> {
    if (state.phase !== 'awaiting_init') {
      closeWithError(ws, CloseCode.TooManyInitialisationRequests, 'Already initialized');
      return;
    }

    if (isConnectionInitTimedOut(state)) {
      closeWithError(ws, CloseCode.ConnectionInitialisationTimeout, 'Init timeout');
      return;
    }

    if (!this.ownerId) {
      closeWithError(ws, CloseCode.Forbidden, 'Forbidden');
      return;
    }

    saveState(ws, {
      ...state,
      phase: 'ready',
      userId: this.ownerId,
    });

    sendConnectionAck(ws);
  }

  async publish(channel: string, event: ChannelEvent): Promise<void> {
    const webSockets = this.ctx.getWebSockets();

    for (const ws of webSockets) {
      try {
        const state = loadState(ws);
        if (state.phase === 'ready') {
          const subscriptionId = state.subscriptions[channel];
          if (subscriptionId) {
            sendNext(ws, subscriptionId, { channel: event });
          }
        }
      } catch (error) {
        console.error('[UserChannel] Failed to send:', error);
      }
    }
  }

  private checkRateLimit(rateLimit: RateLimitState): RateLimitState | null {
    const now = Date.now();
    if (now - rateLimit.windowStart >= RATE_LIMIT.WINDOW_MS) {
      return { windowStart: now, messageCount: 1 };
    }
    if (rateLimit.messageCount >= RATE_LIMIT.MAX_MESSAGES) {
      return null;
    }
    return {
      windowStart: rateLimit.windowStart,
      messageCount: rateLimit.messageCount + 1,
    };
  }
}
```

---

## Migration Path

### Phase 1: Add graphql-ws as Dependency

```bash
pnpm --filter worker add graphql-ws
```

### Phase 2: Replace Types

1. Remove our hand-written message types
2. Import from graphql-ws
3. Update type references

### Phase 3: Replace Parsing/Serialization

1. Replace `JSON.parse()` with `parseMessage()`
2. Replace `JSON.stringify()` with `stringifyMessage()`
3. Replace magic close codes with `CloseCode` enum

### Phase 4: Refactor to Modular Structure

1. Extract protocol utilities to `protocol.ts`
2. Extract state management to `state.ts`
3. Extract handlers to separate files

### Phase 5: Testing

1. Verify protocol compliance with graphql-ws client
2. Test hibernation behavior
3. Test rate limiting
4. Test error handling

---

## Trade-offs

### What We Gain

| Benefit | Description |
|---------|-------------|
| **Protocol compliance** | Using official types and utilities ensures spec compliance |
| **Reduced maintenance** | graphql-ws handles protocol updates |
| **Better error messages** | Built-in validation provides clear errors |
| **Type safety** | Strong TypeScript types for all messages |
| **Community tested** | Battle-tested parsing and validation |

### What We Keep

| Feature | Description |
|---------|-------------|
| **Hibernation support** | Externalized state via serializeAttachment() |
| **Cost efficiency** | DO sleeps between messages |
| **Rate limiting** | Per-connection rate limiting |
| **Channel model** | Our pub/sub abstraction on top of graphql-ws |

### What We Don't Use

| graphql-ws Feature | Reason |
|--------------------|--------|
| `makeServer()` | Requires in-memory state |
| `useServer()` | Designed for ws/uWebSockets |
| GraphQL execution | We use channels, not GraphQL operations |
| `onSubscribe` hooks | We handle subscription logic ourselves |

---

## Conclusion

We can achieve the best of both worlds:

1. **Use graphql-ws** for protocol compliance (types, parsing, codes)
2. **Implement our own state layer** for hibernation support
3. **Keep our channel-based pub/sub** for simplicity

This approach gives us:
- ✅ Protocol-compliant implementation
- ✅ Hibernation support (cost efficiency)
- ✅ Battle-tested message handling
- ✅ Clean separation of concerns
- ✅ Future upgrade path (if graphql-ws adds hibernation support)

The implementation effort is moderate (~2-4 hours) and the result is cleaner, more maintainable code that leverages the community's work while respecting Cloudflare's unique constraints.
