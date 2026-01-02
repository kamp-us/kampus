# Building Real-Time Subscriptions with Cloudflare Durable Objects and GraphQL

A deep dive into implementing WebSocket-based real-time updates using the actor model, hibernatable WebSockets, and Relay.

---

## Table of Contents

1. [Introduction](#introduction)
2. [The Problem](#the-problem)
3. [Architecture Overview](#architecture-overview)
4. [Understanding the Actor Model](#understanding-the-actor-model)
5. [The UserChannel Durable Object](#the-userchannel-durable-object)
6. [Implementing the graphql-ws Protocol](#implementing-the-graphql-ws-protocol)
7. [Hibernatable WebSockets](#hibernatable-websockets)
8. [The Pub/Sub Pattern](#the-pubsub-pattern)
9. [Frontend Integration with Relay](#frontend-integration-with-relay)
10. [Security Considerations](#security-considerations)
11. [Performance Optimizations](#performance-optimizations)
12. [Lessons Learned](#lessons-learned)
13. [Conclusion](#conclusion)

---

## Introduction

Real-time features are table stakes for modern web applications. Users expect to see updates instantly—whether it's a new message, a live collaboration edit, or a notification. This blog post documents how we implemented real-time subscriptions for the Library feature in our application using Cloudflare Workers, Durable Objects, and GraphQL subscriptions.

What makes this implementation interesting is the constraint: we're running on Cloudflare's edge infrastructure, which is stateless by default. Traditional WebSocket servers maintain long-lived connections in memory, but edge workers are ephemeral. We'll explore how Durable Objects solve this problem elegantly using the actor model.

---

## The Problem

Our Library feature allows users to save and organize stories (URLs with metadata). The initial implementation was request-response based:

```
User A creates story → API returns success → User A sees new story
```

But what about User A's other browser tabs? Or User B viewing the same library? They wouldn't see the update until they refreshed the page.

**Requirements:**
1. When a story is created, all connected clients should see it immediately
2. When a story is deleted, it should disappear from all clients
3. The `totalCount` should update in real-time across all clients
4. The solution must work on Cloudflare's edge infrastructure

---

## Architecture Overview

Here's the high-level architecture we arrived at:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser Tabs                            │
├─────────────┬─────────────┬─────────────┬─────────────┬────────┤
│   Tab A     │   Tab B     │   Tab C     │   Tab D     │  ...   │
│  (User 1)   │  (User 1)   │  (User 2)   │  (User 2)   │        │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴────────┘
       │             │             │             │
       │ WebSocket   │ WebSocket   │ WebSocket   │ WebSocket
       │             │             │             │
       ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                            │
│                   (WebSocket Upgrade)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │ Route to user's UserChannel DO  │
          └────────────────┬────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────────┐                 ┌──────────────────┐
│  UserChannel DO  │                 │  UserChannel DO  │
│    (User 1)      │                 │    (User 2)      │
│                  │                 │                  │
│  ┌────────────┐  │                 │  ┌────────────┐  │
│  │ WebSocket  │  │                 │  │ WebSocket  │  │
│  │  (Tab A)   │  │                 │  │  (Tab C)   │  │
│  └────────────┘  │                 │  └────────────┘  │
│  ┌────────────┐  │                 │  ┌────────────┐  │
│  │ WebSocket  │  │                 │  │  WebSocket │  │
│  │  (Tab B)   │  │                 │  │  (Tab D)   │  │
│  └────────────┘  │                 │  └────────────┘  │
└────────▲─────────┘                 └────────▲─────────┘
         │                                    │
         │ publish(channel, event)            │
         │                                    │
┌────────┴─────────┐                 ┌────────┴─────────┐
│   Library DO     │                 │   Library DO     │
│    (User 1)      │                 │    (User 2)      │
│                  │                 │                  │
│  ┌────────────┐  │                 │  ┌────────────┐  │
│  │  SQLite    │  │                 │  │  SQLite    │  │
│  │  Stories   │  │                 │  │  Stories   │  │
│  └────────────┘  │                 │  └────────────┘  │
└──────────────────┘                 └──────────────────┘
```

**Key insight:** Each user gets their own `UserChannel` Durable Object that manages all their WebSocket connections. When the `Library` DO modifies data, it calls the `UserChannel` to broadcast events.

---

## Understanding the Actor Model

Before diving into implementation, let's understand the actor model—the foundation of Durable Objects.

### What is an Actor?

An actor is a computational entity that:
1. **Has private state** - No other actor can directly access it
2. **Processes messages sequentially** - One message at a time, no concurrency within an actor
3. **Communicates via message passing** - Actors don't share memory; they send messages

### Durable Objects as Actors

Cloudflare Durable Objects implement the actor model:

```typescript
export class UserChannel extends DurableObject<Env> {
  // Private state - only this instance can access
  private ownerId: string | undefined = undefined;

  // Messages are processed sequentially
  async webSocketMessage(ws: WebSocket, message: string) {
    // Only one message processed at a time
    // No locks needed!
  }

  // Communication via RPC (message passing)
  async publish(channel: string, event: ChannelEvent) {
    // Called by other DOs
  }
}
```

### Why Actors for WebSockets?

The actor model is perfect for WebSocket management because:

1. **No race conditions** - Sequential message processing means no data races
2. **Isolation** - Each user's connections are isolated in their own actor
3. **Location transparency** - Cloudflare routes requests to the right instance automatically
4. **Fault isolation** - One user's crashed connection doesn't affect others

### Routing to Actors

Durable Objects use `idFromName()` for deterministic routing:

```typescript
// Same userId always routes to same DO instance
const channelId = env.USER_CHANNEL.idFromName(userId);
const channel = env.USER_CHANNEL.get(channelId);
```

This is crucial—it ensures all of a user's WebSocket connections go to the same actor instance.

---

## The UserChannel Durable Object

The `UserChannel` DO is the heart of our real-time system. Let's examine its structure:

### State Management

```typescript
export class UserChannel extends DurableObject<Env> {
  private ownerId: string | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Load persistent state on construction
    this.ctx.blockConcurrencyWhile(async () => {
      this.ownerId = await this.ctx.storage.get<string>("owner");
    });
  }

  async setOwner(userId: string): Promise<void> {
    // Idempotent - prevents race conditions
    if (this.ownerId) return;
    this.ownerId = userId;
    await this.ctx.storage.put("owner", userId);
  }
}
```

**Key patterns:**

1. **`blockConcurrencyWhile()`** - Ensures initialization completes before any requests
2. **Idempotent setters** - `setOwner()` checks if already set, preventing race conditions
3. **Persistent storage** - Owner ID survives DO hibernation/eviction

### Connection State

Each WebSocket connection has attached state that survives hibernation:

```typescript
interface AwaitingInitState {
  state: "awaiting_init";
  connectedAt: number;
  rateLimit: RateLimitState;
}

interface ReadyState {
  state: "ready";
  userId: string;
  subscriptions: Record<string, string>; // channel -> subscriptionId
  rateLimit: RateLimitState;
}

type ConnectionState = AwaitingInitState | ReadyState;
```

State is attached to WebSockets using serialization:

```typescript
// Attach state
ws.serializeAttachment({
  state: "awaiting_init",
  connectedAt: Date.now(),
  rateLimit: { windowStart: Date.now(), messageCount: 0 },
});

// Read state
const state = ws.deserializeAttachment() as ConnectionState;
```

---

## Implementing the graphql-ws Protocol

We implement the [graphql-ws](https://github.com/enisdenjo/graphql-ws) protocol, the modern standard for GraphQL over WebSocket.

### Protocol Flow

```
Client                                    Server
   │                                         │
   │──── connection_init ───────────────────▶│
   │                                         │
   │◀─── connection_ack ────────────────────│
   │                                         │
   │──── subscribe { id, query } ───────────▶│
   │                                         │
   │◀─── next { id, payload } ──────────────│
   │◀─── next { id, payload } ──────────────│
   │                                         │
   │──── complete { id } ───────────────────▶│
   │                                         │
   │◀─── complete { id } ───────────────────│
```

### Message Handler

```typescript
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  // Only accept string messages
  if (typeof message !== "string") {
    this.closeWithError(ws, 4400, "Binary messages not supported");
    return;
  }

  // Parse JSON
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(message);
  } catch {
    this.closeWithError(ws, 4400, "Invalid JSON");
    return;
  }

  // Rate limiting
  const state = ws.deserializeAttachment() as ConnectionState;
  const updatedRateLimit = this.checkRateLimit(state.rateLimit);
  if (!updatedRateLimit) {
    this.closeWithError(ws, 4429, "Rate limit exceeded");
    return;
  }
  ws.serializeAttachment({ ...state, rateLimit: updatedRateLimit });

  // Route by message type
  switch (parsed.type) {
    case "connection_init":
      await this.handleConnectionInit(ws, state);
      break;
    case "subscribe":
      await this.handleSubscribe(ws, parsed, state);
      break;
    case "complete":
      await this.handleComplete(ws, parsed, state);
      break;
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    default:
      this.closeWithError(ws, 4400, "Unknown message type");
  }
}
```

### Connection Initialization

The `connection_init` message establishes the connection:

```typescript
private async handleConnectionInit(ws: WebSocket, state: ConnectionState) {
  // Must be in awaiting_init state
  if (state.state !== "awaiting_init") {
    this.closeWithError(ws, 4429, "Too many initialisation requests");
    return;
  }

  // Check timeout (10 seconds to init)
  if (Date.now() - state.connectedAt > 10_000) {
    this.closeWithError(ws, 4408, "Connection initialisation timeout");
    return;
  }

  // Verify owner is set (authentication happened during upgrade)
  if (!this.ownerId) {
    this.closeWithError(ws, 4403, "Forbidden");
    return;
  }

  // Transition to ready state
  ws.serializeAttachment({
    state: "ready",
    userId: this.ownerId,
    subscriptions: {},
    rateLimit: state.rateLimit,
  });

  ws.send(JSON.stringify({ type: "connection_ack" }));
}
```

### Subscription Handling

Subscriptions register interest in a channel:

```typescript
private async handleSubscribe(
  ws: WebSocket,
  message: SubscribeMessage,
  state: ConnectionState
) {
  if (state.state !== "ready") {
    this.closeWithError(ws, 4401, "Unauthorized");
    return;
  }

  // Parse channel from GraphQL query
  // Expected: subscription { channel(name: "library") { ... } }
  const channelMatch = message.payload.query.match(
    /channel\s*\(\s*name\s*:\s*"([^"]+)"\s*\)/
  );
  if (!channelMatch) {
    ws.send(JSON.stringify({
      id: message.id,
      type: "error",
      payload: [{ message: 'Invalid subscription format' }],
    }));
    return;
  }

  const channelName = channelMatch[1];

  // Validate channel name
  if (channelName.length > 64) {
    ws.send(JSON.stringify({
      id: message.id,
      type: "error",
      payload: [{ message: "Channel name too long" }],
    }));
    return;
  }

  // Whitelist check
  if (!ALLOWED_CHANNELS.has(channelName)) {
    ws.send(JSON.stringify({
      id: message.id,
      type: "error",
      payload: [{ message: `Unknown channel: ${channelName}` }],
    }));
    return;
  }

  // Register subscription
  const newSubscriptions = { ...state.subscriptions, [channelName]: message.id };
  ws.serializeAttachment({
    ...state,
    subscriptions: newSubscriptions,
  });
}
```

---

## Hibernatable WebSockets

Cloudflare's Hibernatable WebSocket API is crucial for cost efficiency.

### The Problem with Traditional WebSockets

Traditional WebSocket servers keep connections alive in memory:

```
Connection opened → Server allocates memory → Server holds memory forever
                                              (even if idle for hours)
```

This is expensive at scale. If you have 10,000 connected users but only 100 are active at any moment, you're paying for 10,000 connections worth of compute.

### Hibernation to the Rescue

Hibernatable WebSockets allow the DO to "sleep" while maintaining connections:

```typescript
// Accept with hibernation support
async fetch(request: Request) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  // Accept with hibernation - key difference!
  this.ctx.acceptWebSocket(server);

  // State survives hibernation via serialization
  server.serializeAttachment({
    state: "awaiting_init",
    connectedAt: Date.now(),
    rateLimit: { windowStart: Date.now(), messageCount: 0 },
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
```

When the DO hibernates:
1. **Memory is freed** - Cloudflare reclaims the DO's memory
2. **Connections remain open** - WebSocket connections stay alive
3. **State is preserved** - Serialized attachment survives hibernation
4. **Wake on message** - When a message arrives, the DO wakes up

### Handler Methods

Instead of event listeners, use handler methods:

```typescript
// Called when message arrives (wakes DO if hibernating)
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  // Handle message
}

// Called when connection closes
async webSocketClose(ws: WebSocket, code: number, reason: string) {
  // Cleanup if needed
}

// Called on WebSocket error
async webSocketError(ws: WebSocket, error: unknown) {
  console.error("[UserChannel] WebSocket error:", error);
}
```

### Retrieving All Connections

The DO can get all connected WebSockets:

```typescript
async publish(channel: string, event: ChannelEvent) {
  // Get all WebSockets connected to this DO
  const webSockets = this.ctx.getWebSockets();

  for (const ws of webSockets) {
    const state = ws.deserializeAttachment() as ConnectionState;
    if (state.state === "ready") {
      const subscriptionId = state.subscriptions[channel];
      if (subscriptionId) {
        ws.send(JSON.stringify({
          id: subscriptionId,
          type: "next",
          payload: { data: { channel: event } },
        }));
      }
    }
  }
}
```

---

## The Pub/Sub Pattern

Our implementation follows a publish-subscribe pattern with clear separation of concerns.

### Publisher: Library DO

The Library DO publishes events when data changes:

```typescript
export class Library extends DurableObject<Env> {
  async createStory(options: { url: string; title: string; description?: string }) {
    // 1. Validate input
    if (options.title.length > MAX_TITLE_LENGTH) {
      throw new Error("Title too long");
    }

    // 2. Insert with atomic count
    const result = await this.db.transaction(async (tx) => {
      const [story] = await tx
        .insert(schema.story)
        .values({ url, title, description })
        .returning();

      const countResult = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.story);

      return { story, totalStories: countResult[0]?.count ?? 0 };
    });

    // 3. Publish events (best-effort)
    await this.publishToLibrary({
      type: "story:create",
      story: this.toStoryPayload(result.story),
    });
    await this.publishLibraryChange({ stories: result.totalStories });

    return result.story;
  }

  private async publishToLibrary(event: LibraryEvent) {
    try {
      const userChannel = this.getUserChannel();
      await userChannel.publish("library", event);
    } catch (error) {
      // Log but don't throw - mutation succeeded, broadcast is best-effort
      console.error("Failed to publish event:", error);
    }
  }
}
```

**Key patterns:**

1. **Transaction for accuracy** - Insert and count in same transaction ensures correct `totalCount`
2. **Best-effort delivery** - Publish errors don't fail the mutation
3. **Typed events** - Each event has a discriminated type field

### Event Types

Events are strongly typed:

```typescript
interface StoryCreateEvent {
  type: "story:create";
  story: StoryPayload;
}

interface StoryDeleteEvent {
  type: "story:delete";
  deletedStoryId: string; // Global ID
}

interface LibraryChangeEvent {
  type: "library:change";
  totalStories: number;
  totalTags: number;
}

type LibraryEvent = StoryCreateEvent | StoryDeleteEvent | LibraryChangeEvent;
```

### Subscriber: UserChannel DO

The UserChannel receives and routes events:

```typescript
async publish(channel: string, event: ChannelEvent) {
  const webSockets = this.ctx.getWebSockets();

  for (const ws of webSockets) {
    try {
      const state = ws.deserializeAttachment() as ConnectionState;

      if (state.state === "ready") {
        const subscriptionId = state.subscriptions[channel];
        if (subscriptionId) {
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: "next",
            payload: {
              data: { channel: event },
            },
          }));
        }
      }
    } catch (error) {
      console.error("[UserChannel] Failed to send:", error);
    }
  }
}
```

---

## Frontend Integration with Relay

The frontend uses Relay for state management and the graphql-ws client for subscriptions.

### Singleton Client

We use a singleton WebSocket client to avoid multiple connections:

```typescript
// environment.ts
let subscriptionClient: Client | null = null;

export function getSubscriptionClient(): Client {
  if (!subscriptionClient) {
    subscriptionClient = createClient({
      url: getWebSocketUrl(),
      retryAttempts: Infinity,
      shouldRetry: () => true,
      retryWait: (retryCount) => {
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        return new Promise((resolve) => setTimeout(resolve, delay));
      },
    });
  }
  return subscriptionClient;
}

export function resetSubscriptionClient() {
  if (subscriptionClient) {
    subscriptionClient.dispose();
    subscriptionClient = null;
  }
}
```

### Subscription Hook

The subscription hook listens for events and updates Relay's store:

```typescript
function useLibrarySubscription(connectionId: string | null) {
  const environment = useRelayEnvironment();

  useEffect(() => {
    if (!connectionId) return;

    const client = getSubscriptionClient();

    const unsubscribe = client.subscribe(
      {
        query: 'subscription { channel(name: "library") { type } }',
      },
      {
        next: (result) => {
          const event = result.data?.channel;
          if (!event) return;

          // Handle different event types
          if (event.type === "library:change") {
            handleLibraryChange(environment, connectionId, event);
          }
          if (event.type === "story:create") {
            handleStoryCreate(environment, connectionId, event);
          }
          if (event.type === "story:delete") {
            handleStoryDelete(environment, connectionId, event);
          }
        },
        error: (error) => {
          console.error("[Library Subscription] Error:", error);
        },
      }
    );

    return () => unsubscribe();
  }, [connectionId, environment]);
}
```

### Updating the Relay Store

Relay's store is updated imperatively for subscription events:

```typescript
function handleStoryCreate(
  environment: Environment,
  connectionId: string,
  event: StoryCreateEvent
) {
  const globalId = event.story.id;

  environment.commitUpdate((store) => {
    const connection = store.get(connectionId);
    if (!connection) return;

    // Check for duplicates (own mutation may have already added it)
    const edges = connection.getLinkedRecords("edges") || [];
    const exists = edges.some((edge) => {
      const node = edge?.getLinkedRecord("node");
      if (!node) return false;
      return node.getDataID() === globalId || node.getValue("id") === globalId;
    });
    if (exists) return;

    // Create story record
    const storyRecord = store.create(globalId, "Story");
    storyRecord.setValue(globalId, "id");
    storyRecord.setValue(event.story.url, "url");
    storyRecord.setValue(event.story.title, "title");
    storyRecord.setValue(event.story.description, "description");
    storyRecord.setValue(event.story.createdAt, "createdAt");
    storyRecord.setLinkedRecords([], "tags");

    // Create edge and prepend
    const edgeId = `client:edge:${globalId}`;
    const edge = store.create(edgeId, "StoryEdge");
    edge.setLinkedRecord(storyRecord, "node");
    edge.setValue(globalId, "cursor");

    connection.setLinkedRecords([edge, ...edges], "edges");
  });
}
```

### Duplicate Prevention

When a user creates a story, both the mutation response and the subscription event will try to add it. We handle this by checking for duplicates:

```typescript
// Check both getDataID() and id field for robustness
const exists = edges.some((edge) => {
  const node = edge?.getLinkedRecord("node");
  if (!node) return false;
  const nodeId = node.getValue("id");
  return node.getDataID() === globalId || nodeId === globalId;
});
if (exists) return; // Skip if already exists
```

---

## Security Considerations

Real-time systems introduce unique security challenges.

### Authentication

WebSocket connections authenticate via URL token (cookies don't work cross-origin):

```typescript
// Frontend: Add token to URL
function getWebSocketUrl(): string {
  const token = getStoredToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";

  if (import.meta.env.DEV) {
    return `ws://localhost:8787/graphql${tokenParam}`;
  }
  return `wss://${window.location.host}/graphql${tokenParam}`;
}

// Backend: Validate token on upgrade
app.use("/graphql", async (c, next) => {
  if (isWebSocketUpgrade(c.req)) {
    const token = new URL(c.req.url).searchParams.get("token");
    if (token) {
      const session = await pasaport.validateBearerToken(token);
      if (session) {
        userId = session.user.id;
      }
    }
    // Route to UserChannel...
  }
});
```

**Security note:** Tokens in URLs can be logged. Mitigations:
- Use short-lived tokens
- Always use WSS (TLS) in production
- Tokens are single-purpose (can't be used for API calls)

### Rate Limiting

Per-connection rate limiting prevents abuse:

```typescript
const RATE_LIMIT = {
  WINDOW_MS: 60_000,     // 1 minute window
  MAX_MESSAGES: 100,      // Max messages per window
};

private checkRateLimit(rateLimit: RateLimitState): RateLimitState | null {
  const now = Date.now();

  // Reset window if expired
  if (now - rateLimit.windowStart >= RATE_LIMIT.WINDOW_MS) {
    return { windowStart: now, messageCount: 1 };
  }

  // Check limit
  if (rateLimit.messageCount >= RATE_LIMIT.MAX_MESSAGES) {
    return null; // Limit exceeded
  }

  return {
    windowStart: rateLimit.windowStart,
    messageCount: rateLimit.messageCount + 1,
  };
}
```

### Channel Whitelisting

Only allowed channels can be subscribed to:

```typescript
const ALLOWED_CHANNELS = new Set(["library", "notifications"]);

// In handleSubscribe:
if (!ALLOWED_CHANNELS.has(channelName)) {
  ws.send(JSON.stringify({
    id: message.id,
    type: "error",
    payload: [{ message: `Unknown channel: ${channelName}` }],
  }));
  return;
}
```

### Input Validation

Payload sizes are limited to prevent abuse:

```typescript
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

async createStory(options: { url: string; title: string; description?: string }) {
  if (options.url.length > MAX_URL_LENGTH) {
    throw new Error("URL too long");
  }
  if (options.title.length > MAX_TITLE_LENGTH) {
    throw new Error("Title too long");
  }
  if (options.description && options.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error("Description too long");
  }
  // ...
}
```

### Logout Cleanup

WebSocket connections are closed on logout:

```typescript
const logout = useCallback(() => {
  setAuthState({ user: null, token: null });
  clearAuthState();
  resetSubscriptionClient(); // Close WebSocket
}, []);
```

---

## Performance Optimizations

### Atomic Transactions

Using transactions ensures accurate counts without race conditions:

```typescript
const result = await this.db.transaction(async (tx) => {
  const [story] = await tx.insert(schema.story).values(data).returning();

  // Count is accurate because it's in the same transaction
  const countResult = await tx
    .select({ count: sql<number>`count(*)` })
    .from(schema.story);

  return { story, totalStories: countResult[0]?.count ?? 0 };
});
```

### Pagination Limits

Unbounded queries are prevented:

```typescript
const MAX_PAGE_SIZE = 100;

async listStories(options?: { first?: number; after?: string }) {
  const limit = Math.min(options?.first ?? 20, MAX_PAGE_SIZE);
  // ...
}
```

### Idempotent Operations

Initialization methods are idempotent to prevent unnecessary writes:

```typescript
async init(owner: string) {
  if (this.ownerId) return; // Already initialized
  this.ownerId = owner;
  await this.ctx.storage.put("owner", owner);
}

async setOwner(userId: string) {
  if (this.ownerId) return; // Already set
  this.ownerId = userId;
  await this.ctx.storage.put("owner", userId);
}
```

### Best-Effort Delivery

Subscription broadcasts don't block mutations:

```typescript
private async publishToLibrary(event: LibraryEvent) {
  try {
    const userChannel = this.getUserChannel();
    await userChannel.publish("library", event);
  } catch (error) {
    // Log but don't throw - mutation already succeeded
    console.error("Failed to publish event:", error);
  }
}
```

---

## Lessons Learned

### 1. Actor Model Simplifies Concurrency

The actor model eliminated entire classes of bugs. No locks, no race conditions in message handlers, no shared state between users.

### 2. Hibernation is Essential for Scale

Without hibernatable WebSockets, we'd pay for idle connections. Hibernation makes real-time features economically viable at scale.

### 3. Idempotency Everywhere

Every initialization and setup method should be idempotent. Multiple WebSocket connections, retries, and race conditions are common in distributed systems.

### 4. Best-Effort is Often Good Enough

Real-time updates don't need guaranteed delivery for most use cases. If a subscription event is missed, the data is still consistent—the user just needs to refresh.

### 5. Security at Every Layer

- Authentication on WebSocket upgrade
- Rate limiting per connection
- Channel whitelisting
- Input validation
- Cleanup on logout

### 6. Global IDs for Deduplication

Using global IDs (base64-encoded type + local ID) makes deduplication reliable across different sources (mutations, subscriptions, cache).

### 7. Singleton Clients Prevent Connection Bloat

Creating one WebSocket client per component leads to connection explosion. A singleton with proper cleanup is essential.

---

## Conclusion

Building real-time subscriptions on Cloudflare's edge infrastructure required rethinking traditional WebSocket patterns. The actor model, implemented via Durable Objects, provided a clean abstraction for managing per-user state. Hibernatable WebSockets made the solution cost-effective at scale.

Key takeaways:
- **Use Durable Objects as actors** - One DO per user for WebSocket management
- **Embrace hibernation** - Design for wake-on-message patterns
- **Separate concerns** - Data DOs (Library) publish events, connection DOs (UserChannel) manage delivery
- **Be defensive** - Idempotency, rate limiting, input validation
- **Best-effort is fine** - Don't let subscription failures block mutations

The resulting architecture is simple, scalable, and maintainable. It handles the real-time requirements without sacrificing the benefits of edge deployment.

---

## Further Reading

- [Cloudflare Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/api/websockets/)
- [graphql-ws Protocol](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
- [Relay Store Updates](https://relay.dev/docs/guided-tour/updating-data/graphql-subscriptions/)
- [Actor Model Explained](https://en.wikipedia.org/wiki/Actor_model)
