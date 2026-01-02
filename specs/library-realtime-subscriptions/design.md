# Library Realtime Subscriptions - Technical Design

## 1. Architecture Overview

### Key Architectural Decision: UserChannel DO

Instead of adding WebSocket handling directly to Library DO, we introduce a dedicated **UserChannel DO** that:

- Is user-scoped (one per user, keyed by userId)
- Handles all WebSocket connections for that user
- Implements the graphql-ws protocol
- Manages channel subscriptions (e.g., "library", "notifications")
- Exposes a `publish(channel, event)` RPC method for other DOs

This design enables reuse across future features (notifications, presence, collaborative editing) without duplicating WebSocket infrastructure.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Browser                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  React App                                                       │    │
│  │  ┌─────────────────┐  ┌─────────────────────────────────────┐   │    │
│  │  │ Relay Store     │◄─┤ graphql-ws Client                    │   │    │
│  │  │ - Stories       │  │ - ConnectionInit (with auth token)   │   │    │
│  │  │ - Tags          │  │ - Subscribe to "library" channel     │   │    │
│  │  │ - totalCount    │  │ - Reconnect with exp. backoff        │   │    │
│  │  └─────────────────┘  └───────────────────┬─────────────────┘   │    │
│  └───────────────────────────────────────────┼─────────────────────┘    │
└──────────────────────────────────────────────┼──────────────────────────┘
                                               │ WebSocket
                                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Worker (apps/worker/src/index.ts)                               │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  Hono Router                                             │    │    │
│  │  │  /graphql                                                │    │    │
│  │  │    ├─ POST/GET → GraphQL Yoga (queries/mutations)        │    │    │
│  │  │    └─ WebSocket Upgrade → Route to UserChannel DO        │    │    │
│  │  └────────────────────────────────────┬────────────────────┘    │    │
│  └───────────────────────────────────────┼────────────────────────┘     │
│                                          │ Route by user ID             │
│                                          ▼                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  UserChannel DO (per-user)                                       │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  WebSocket Manager                                       │    │    │
│  │  │  - ctx.acceptWebSocket()     - webSocketMessage()        │    │    │
│  │  │  - ctx.getWebSockets()       - webSocketClose()          │    │    │
│  │  │  - serializeAttachment()     - graphql-ws protocol       │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  Channel Subscriptions (in-memory, from attachments)     │    │    │
│  │  │  - "library" → [ws1, ws2, ws3]                           │    │    │
│  │  │  - "notifications" → [ws1, ws4]  (future)                │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │  RPC Methods:                                                    │    │
│  │  └─ publish(channel, event) ← Called by other DOs               │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                         ▲                                                │
│                         │ userChannel.publish("library", event)          │
│                         │                                                │
│  ┌──────────────────────┴──────────────────────────────────────────┐    │
│  │  Library DO (per-user)                                           │    │
│  │  ┌───────────────────┐                                          │    │
│  │  │  SQLite (Drizzle) │  RPC Methods:                            │    │
│  │  │  - story table    │  ├─ createStory() → publish story:create │    │
│  │  │  - tag table      │  ├─ updateStory() → publish story:update │    │
│  │  │  - story_tag      │  ├─ deleteStory() → publish story:delete │    │
│  │  └───────────────────┘  └─ ...                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Subscription Establishment

```
1. Browser initiates WebSocket connection
   ┌────────────┐                      ┌────────────┐                ┌──────────────┐
   │  Browser   │──WebSocket Upgrade──►│  Worker    │───Forward────►│ UserChannel  │
   │            │  Sec-WebSocket-      │            │   to DO        │ DO (user_123)│
   │            │  Protocol: graphql-  │            │   by userId    │              │
   └────────────┘  transport-ws        └────────────┘                └──────────────┘

2. UserChannel DO accepts and awaits ConnectionInit
   ┌────────────┐                                                    ┌──────────────┐
   │  Browser   │                                                    │ UserChannel  │
   │            │──ConnectionInit {payload: {token: "..."}}─────────►│              │
   │            │                                                    │ Validate     │
   │            │◄─ConnectionAck {}─────────────────────────────────│              │
   └────────────┘                                                    └──────────────┘

3. Client subscribes to "library" channel
   ┌────────────┐                                                    ┌──────────────┐
   │  Browser   │──Subscribe {id:"1", query:"subscription           │ UserChannel  │
   │            │   LibraryChanges { channel(name:"library") }"}───►│              │
   │            │                                                    │ Register ws  │
   │            │                                                    │ for "library"│
   └────────────┘                                                    └──────────────┘
```

### Data Flow: Event Broadcasting

```
1. Mutation in Library DO triggers publish to UserChannel DO
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                              Library DO                                   │
   │                                                                           │
   │  createStory(url, title)                                                  │
   │    │                                                                      │
   │    ▼                                                                      │
   │  [Insert into SQLite]                                                     │
   │    │                                                                      │
   │    ▼                                                                      │
   │  const userChannel = this.env.USER_CHANNEL.get(                           │
   │    this.env.USER_CHANNEL.idFromName(userId)                               │
   │  );                                                                       │
   │  await userChannel.publish("library", {                                   │
   │    type: "story:create",                                                  │
   │    story: { id, url, title, ... }                                         │
   │  });                                                                      │
   └──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                            UserChannel DO                                 │
   │                                                                           │
   │  publish(channel: "library", event)                                       │
   │    │                                                                      │
   │    ▼                                                                      │
   │  ctx.getWebSockets().forEach(ws => {                                      │
   │    const state = ws.deserializeAttachment();                              │
   │    if (state.channels.includes("library")) {                              │
   │      ws.send(JSON.stringify({                                             │
   │        id: state.subscriptionIds["library"],                              │
   │        type: "next",                                                      │
   │        payload: { data: { channel: event } }                              │
   │      }));                                                                 │
   │    }                                                                      │
   │  });                                                                      │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. UserChannel DO Design

### Responsibilities

1. **WebSocket Connection Management**
   - Accept WebSocket upgrades with hibernation support
   - Handle graphql-ws protocol (ConnectionInit, Subscribe, Complete, Ping/Pong)
   - Manage connection lifecycle and cleanup

2. **Channel Subscription Management**
   - Track which WebSocket connections are subscribed to which channels
   - Support multiple channel subscriptions per connection
   - Handle subscribe/unsubscribe operations

3. **Event Publishing**
   - Expose `publish(channel, event)` RPC method for other DOs
   - Broadcast events only to WebSockets subscribed to that channel
   - Handle serialization and graphql-ws message formatting

### Connection State Structure

```typescript
// apps/worker/src/features/user-channel/types.ts

export interface AwaitingInitState {
  state: "awaiting_init";
  connectedAt: number;
}

export interface ReadyState {
  state: "ready";
  userId: string;
  // Map of channel name -> subscription ID (from graphql-ws Subscribe message)
  subscriptions: Record<string, string>;
}

export type ConnectionState = AwaitingInitState | ReadyState;
```

### RPC Interface

```typescript
// apps/worker/src/features/user-channel/UserChannel.ts

export class UserChannel extends DurableObject<Env> {
  /**
   * Publish an event to all WebSocket connections subscribed to the channel.
   * Called by other DOs (Library, Notifications, etc.)
   */
  async publish(channel: string, event: ChannelEvent): Promise<void>;

  /**
   * Get count of active connections (for monitoring/debugging)
   */
  async getConnectionCount(): Promise<number>;

  /**
   * Get count of subscribers for a specific channel
   */
  async getSubscriberCount(channel: string): Promise<number>;
}
```

### Implementation

```typescript
// apps/worker/src/features/user-channel/UserChannel.ts

import {DurableObject} from "cloudflare:workers";
import type {ConnectionState, ReadyState, ChannelEvent} from "./types";

export class UserChannel extends DurableObject<Env> {
  private ownerId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Load owner ID on construction
    this.ctx.blockConcurrencyWhile(async () => {
      this.ownerId = await this.ctx.storage.get<string>("owner");
    });
  }

  /**
   * Set the owner of this channel (called once when user is created)
   */
  async setOwner(userId: string): Promise<void> {
    this.ownerId = userId;
    await this.ctx.storage.put("owner", userId);
  }

  /**
   * Handle WebSocket upgrade requests
   */
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", {status: 426});
    }

    const protocol = request.headers.get("Sec-WebSocket-Protocol");
    if (protocol !== "graphql-transport-ws") {
      return new Response("Unsupported WebSocket Protocol", {status: 400});
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      state: "awaiting_init",
      connectedAt: Date.now(),
    } satisfies ConnectionState);

    return new Response(null, {
      status: 101,
      headers: {
        "Sec-WebSocket-Protocol": "graphql-transport-ws",
      },
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages (graphql-ws protocol)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      this.closeWithError(ws, 4400, "Binary messages not supported");
      return;
    }

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.closeWithError(ws, 4400, "Invalid JSON");
      return;
    }

    const state = ws.deserializeAttachment() as ConnectionState;

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
        ws.send(JSON.stringify({type: "pong"}));
        break;

      default:
        this.closeWithError(ws, 4400, "Unknown message type");
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    console.log(`WebSocket closed: code=${code}, reason=${reason}, clean=${wasClean}`);
  }

  /**
   * Publish event to all subscribers of a channel
   */
  async publish(channel: string, event: ChannelEvent): Promise<void> {
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
                data: {
                  channel: event,
                },
              },
            }));
          }
        }
      } catch (error) {
        console.error("Failed to send to WebSocket:", error);
      }
    }
  }

  async getConnectionCount(): Promise<number> {
    return this.ctx.getWebSockets().length;
  }

  async getSubscriberCount(channel: string): Promise<number> {
    const webSockets = this.ctx.getWebSockets();
    let count = 0;

    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as ConnectionState;
      if (state.state === "ready" && state.subscriptions[channel]) {
        count++;
      }
    }

    return count;
  }

  // --- Private methods ---

  private async handleConnectionInit(ws: WebSocket, state: ConnectionState): Promise<void> {
    if (state.state !== "awaiting_init") {
      this.closeWithError(ws, 4429, "Too many initialisation requests");
      return;
    }

    if (Date.now() - state.connectedAt > 10_000) {
      this.closeWithError(ws, 4408, "Connection initialisation timeout");
      return;
    }

    if (!this.ownerId) {
      this.closeWithError(ws, 4403, "Forbidden");
      return;
    }

    ws.serializeAttachment({
      state: "ready",
      userId: this.ownerId,
      subscriptions: {},
    } satisfies ReadyState);

    ws.send(JSON.stringify({type: "connection_ack"}));
  }

  private async handleSubscribe(
    ws: WebSocket,
    message: SubscribeMessage,
    state: ConnectionState
  ): Promise<void> {
    if (state.state !== "ready") {
      this.closeWithError(ws, 4401, "Unauthorized");
      return;
    }

    // Extract channel name from subscription query
    // Expected format: subscription { channel(name: "library") { ... } }
    const channelMatch = message.payload.query.match(/channel\s*\(\s*name\s*:\s*"([^"]+)"\s*\)/);
    if (!channelMatch) {
      ws.send(JSON.stringify({
        id: message.id,
        type: "error",
        payload: [{message: "Invalid subscription: must specify channel(name: \"...\")"}],
      }));
      return;
    }

    const channelName = channelMatch[1];

    // Register subscription
    const newSubscriptions = {...state.subscriptions, [channelName]: message.id};
    ws.serializeAttachment({
      ...state,
      subscriptions: newSubscriptions,
    } satisfies ReadyState);
  }

  private async handleComplete(
    ws: WebSocket,
    message: CompleteMessage,
    state: ConnectionState
  ): Promise<void> {
    if (state.state !== "ready") return;

    // Find and remove the subscription by ID
    const newSubscriptions = {...state.subscriptions};
    for (const [channel, subId] of Object.entries(newSubscriptions)) {
      if (subId === message.id) {
        delete newSubscriptions[channel];
        break;
      }
    }

    ws.serializeAttachment({
      ...state,
      subscriptions: newSubscriptions,
    } satisfies ReadyState);

    ws.send(JSON.stringify({id: message.id, type: "complete"}));
  }

  private closeWithError(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }
}

// --- Message Types ---

interface ConnectionInitMessage {
  type: "connection_init";
  payload?: Record<string, unknown>;
}

interface SubscribeMessage {
  type: "subscribe";
  id: string;
  payload: {
    query: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
}

interface CompleteMessage {
  type: "complete";
  id: string;
}

interface PingMessage {
  type: "ping";
}

type ClientMessage = ConnectionInitMessage | SubscribeMessage | CompleteMessage | PingMessage;
```

---

## 3. WebSocket Connection Routing

### Worker Entry Point

```typescript
// apps/worker/src/index.ts

// Before GraphQL Yoga middleware, check for WebSocket upgrade
app.use("/graphql", async (c, next) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader?.toLowerCase() === "websocket") {
    // Validate session
    const pasaport = c.env.PASAPORT.getByName("kampus");
    const sessionData = await pasaport.validateSession(c.req.raw.headers);

    if (!sessionData?.user?.id) {
      return new Response("Unauthorized", {status: 401});
    }

    // Route to user's UserChannel DO
    const channelId = c.env.USER_CHANNEL.idFromName(sessionData.user.id);
    const userChannel = c.env.USER_CHANNEL.get(channelId);

    return userChannel.fetch(c.req.raw);
  }

  return next();
});
```

### Wrangler Configuration

```jsonc
// apps/worker/wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      // ... existing bindings ...
      {
        "name": "USER_CHANNEL",
        "class_name": "UserChannel"
      }
    ]
  }
}
```

---

## 4. Library DO Integration

### Publishing Events

```typescript
// apps/worker/src/features/library/Library.ts

import {encodeGlobalId, NodeType} from "../../graphql/relay";
import type {LibraryEvent} from "./subscription-types";

export class Library extends DurableObject<Env> {
  private ownerId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
      this.ownerId = await this.ctx.storage.get<string>("owner");
    });
  }

  // --- Helper to get UserChannel for this user ---

  private getUserChannel() {
    if (!this.ownerId) {
      throw new Error("Library has no owner");
    }
    const channelId = this.env.USER_CHANNEL.idFromName(this.ownerId);
    return this.env.USER_CHANNEL.get(channelId);
  }

  private async publishToLibrary(event: LibraryEvent): Promise<void> {
    try {
      const userChannel = this.getUserChannel();
      await userChannel.publish("library", event);
    } catch (error) {
      // Log but don't fail - mutation succeeded, broadcast is best-effort
      console.error("Failed to publish event:", error);
    }
  }

  private async publishLibraryChange(): Promise<void> {
    const totalStories = await this.getStoryCount();
    const totalTags = await this.getTagCount();

    await this.publishToLibrary({
      type: "library:change",
      totalStories,
      totalTags,
    });
  }

  // --- Modified CRUD methods ---

  async createStory(options: {url: string; title: string; description?: string}) {
    const {url, title, description} = options;

    // Existing insert logic...
    const [story] = await this.db
      .insert(schema.story)
      .values({url, normalizedUrl: getNormalizedUrl(url), title, description})
      .returning();

    const storyResult = {
      ...story,
      createdAt: story.createdAt.toISOString(),
    };

    // Publish events
    await this.publishToLibrary({
      type: "story:create",
      story: {
        id: encodeGlobalId(NodeType.Story, story.id),
        url: story.url,
        title: story.title,
        description: story.description ?? null,
        createdAt: storyResult.createdAt,
      },
    });
    await this.publishLibraryChange();

    return storyResult;
  }

  async updateStory(id: string, updates: {title?: string; description?: string | null}) {
    const story = await this.db.transaction(async (tx) => {
      // ... existing transaction code ...
    });

    if (story) {
      await this.publishToLibrary({
        type: "story:update",
        story: {
          id: encodeGlobalId(NodeType.Story, story.id),
          url: story.url,
          title: story.title,
          description: story.description ?? null,
          createdAt: story.createdAt,
        },
      });
    }

    return story;
  }

  async deleteStory(id: string) {
    const deleted = await this.db.transaction(async (tx) => {
      // ... existing delete logic ...
    });

    if (deleted) {
      await this.publishToLibrary({
        type: "story:delete",
        deletedStoryId: encodeGlobalId(NodeType.Story, id),
      });
      await this.publishLibraryChange();
    }

    return deleted;
  }

  // Similar patterns for tag operations...
  async createTag(name: string, color: string) {
    // ... existing insert ...
    await this.publishToLibrary({type: "tag:create", tag: {...}});
    await this.publishLibraryChange();
  }

  async updateTag(id: string, updates: {...}) {
    // ... existing update ...
    await this.publishToLibrary({type: "tag:update", tag: {...}});
  }

  async deleteTag(id: string) {
    // ... existing delete ...
    await this.publishToLibrary({type: "tag:delete", deletedTagId: ...});
    await this.publishLibraryChange();
  }

  async tagStory(storyId: string, tagIds: string[]) {
    // ... existing logic ...
    await this.publishToLibrary({type: "story:tag", storyId: ..., tagIds: [...]});
  }

  async untagStory(storyId: string, tagIds: string[]) {
    // ... existing logic ...
    await this.publishToLibrary({type: "story:untag", storyId: ..., tagIds: [...]});
  }

  // --- Helper methods ---

  private async getStoryCount(): Promise<number> {
    const result = await this.db.select({count: sql<number>`count(*)`}).from(schema.story);
    return result[0]?.count ?? 0;
  }

  private async getTagCount(): Promise<number> {
    const result = await this.db.select({count: sql<number>`count(*)`}).from(schema.tag);
    return result[0]?.count ?? 0;
  }
}
```

---

## 5. Event Types

### Library Channel Events

```typescript
// apps/worker/src/features/library/subscription-types.ts

export interface StoryPayload {
  id: string;        // Global ID
  url: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface TagPayload {
  id: string;        // Global ID
  name: string;
  color: string;
  createdAt: string;
}

export type LibraryEvent =
  | {type: "story:create"; story: StoryPayload}
  | {type: "story:update"; story: StoryPayload}
  | {type: "story:delete"; deletedStoryId: string}
  | {type: "tag:create"; tag: TagPayload}
  | {type: "tag:update"; tag: TagPayload}
  | {type: "tag:delete"; deletedTagId: string}
  | {type: "story:tag"; storyId: string; tagIds: string[]}
  | {type: "story:untag"; storyId: string; tagIds: string[]}
  | {type: "library:change"; totalStories: number; totalTags: number};
```

### Generic Channel Event (for UserChannel DO)

```typescript
// apps/worker/src/features/user-channel/types.ts

// Generic event that can be published to any channel
export interface ChannelEvent {
  type: string;
  [key: string]: unknown;
}
```

---

## 6. GraphQL Schema Design

### Subscription Type Definition

```typescript
// apps/worker/src/index.ts (additions)

// Event payload types
const StoryPayloadType = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
}).annotations({title: "StoryPayload"});

const TagPayloadType = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  createdAt: Schema.String,
}).annotations({title: "TagPayload"});

// Library channel event union
const LibraryChannelEvent = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("story:create"),
    story: StoryPayloadType,
  }),
  Schema.Struct({
    type: Schema.Literal("story:update"),
    story: StoryPayloadType,
  }),
  Schema.Struct({
    type: Schema.Literal("story:delete"),
    deletedStoryId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("tag:create"),
    tag: TagPayloadType,
  }),
  Schema.Struct({
    type: Schema.Literal("tag:update"),
    tag: TagPayloadType,
  }),
  Schema.Struct({
    type: Schema.Literal("tag:delete"),
    deletedTagId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("story:tag"),
    storyId: Schema.String,
    tagIds: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("story:untag"),
    storyId: Schema.String,
    tagIds: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("library:change"),
    totalStories: Schema.Number,
    totalTags: Schema.Number,
  }),
).annotations({title: "LibraryChannelEvent"});
```

### Generated GraphQL Schema

```graphql
type Subscription {
  channel(name: String!): ChannelEvent!
}

union ChannelEvent = LibraryChannelEvent | NotificationEvent | ...

union LibraryChannelEvent =
  | StoryCreateEvent
  | StoryUpdateEvent
  | StoryDeleteEvent
  | TagCreateEvent
  | TagUpdateEvent
  | TagDeleteEvent
  | StoryTagEvent
  | StoryUntagEvent
  | LibraryChangeEvent

type StoryCreateEvent {
  type: String!  # "story:create"
  story: StoryPayload!
}

type StoryUpdateEvent {
  type: String!  # "story:update"
  story: StoryPayload!
}

type StoryDeleteEvent {
  type: String!  # "story:delete"
  deletedStoryId: String!
}

type LibraryChangeEvent {
  type: String!  # "library:change"
  totalStories: Int!
  totalTags: Int!
}

# ... other event types ...
```

---

## 7. Frontend Integration

### Relay Environment Modifications

```typescript
// apps/kamp-us/src/relay/environment.ts

import {
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
  type FetchFunction,
  type GraphQLResponse,
  type SubscribeFunction,
} from "relay-runtime";
import {createClient} from "graphql-ws";

const fetchQuery: FetchFunction = async (operation, variables) => {
  // ... existing implementation ...
};

function createSubscriptionClient() {
  return createClient({
    url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/graphql`,
    retryAttempts: Infinity,
    shouldRetry: () => true,
    retryWait: (retryCount) => {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      return new Promise(resolve => setTimeout(resolve, delay));
    },
    on: {
      connected: () => console.log("Subscription connected"),
      closed: () => console.log("Subscription closed"),
      error: (error) => console.error("Subscription error:", error),
    },
  });
}

let subscriptionClient: ReturnType<typeof createClient> | null = null;

function getSubscriptionClient() {
  if (!subscriptionClient) {
    subscriptionClient = createSubscriptionClient();
  }
  return subscriptionClient;
}

export function resetSubscriptionClient() {
  if (subscriptionClient) {
    subscriptionClient.dispose();
    subscriptionClient = null;
  }
}

const subscribe: SubscribeFunction = (operation, variables) => {
  return Observable.create((sink) => {
    const client = getSubscriptionClient();

    return client.subscribe(
      {
        operationName: operation.name,
        query: operation.text!,
        variables,
      },
      {
        next: (value) => sink.next(value as GraphQLResponse),
        error: sink.error,
        complete: sink.complete,
      }
    );
  });
};

export function createRelayEnvironment() {
  return new Environment({
    network: Network.create(fetchQuery, subscribe),
    store: new Store(new RecordSource()),
  });
}

export const environment = createRelayEnvironment();
```

### Subscription Hook Usage

```typescript
// apps/kamp-us/src/pages/Library.tsx

import {useSubscription, graphql, useRelayEnvironment} from "react-relay";
import {useMemo} from "react";

const LibraryChannelSubscription = graphql`
  subscription LibraryChannelSubscription {
    channel(name: "library") {
      ... on StoryCreateEvent {
        type
        story { id url title description createdAt }
      }
      ... on StoryUpdateEvent {
        type
        story { id url title description createdAt }
      }
      ... on StoryDeleteEvent {
        type
        deletedStoryId
      }
      ... on TagCreateEvent {
        type
        tag { id name color createdAt }
      }
      ... on TagUpdateEvent {
        type
        tag { id name color createdAt }
      }
      ... on TagDeleteEvent {
        type
        deletedTagId
      }
      ... on StoryTagEvent {
        type
        storyId
        tagIds
      }
      ... on StoryUntagEvent {
        type
        storyId
        tagIds
      }
      ... on LibraryChangeEvent {
        type
        totalStories
        totalTags
      }
    }
  }
`;

function useLibrarySubscription(connectionId: string | null) {
  useSubscription(
    useMemo(
      () => ({
        subscription: LibraryChannelSubscription,
        variables: {},
        updater: (store, data) => {
          const event = data?.channel;
          if (!event) return;

          if (event.type === "library:change" && connectionId) {
            const connection = store.get(connectionId);
            if (connection) {
              connection.setValue(event.totalStories, "totalCount");
            }
          }
        },
        onError: (error) => {
          console.error("Subscription error:", error);
        },
      }),
      [connectionId]
    )
  );
}
```

---

## 8. graphql-ws Protocol Handling

### Message Flow

```
Client                                              Server (UserChannel DO)
  │                                                        │
  │──────── WebSocket Upgrade ─────────────────────────────►
  │                                                        │
  │◄─────── 101 Switching Protocols ───────────────────────│
  │                                                        │
  │──────── {"type":"connection_init","payload":{}} ──────►│
  │                                                        │ Validate
  │◄─────── {"type":"connection_ack"} ─────────────────────│
  │                                                        │
  │──────── {"type":"subscribe","id":"1",                  │
  │          "payload":{"query":"subscription {            │
  │            channel(name:\"library\") {...}             │
  │          }"}} ────────────────────────────────────────►│
  │                                                        │ Register for
  │                                                        │ "library" channel
  │         [Library DO calls publish("library", event)]   │
  │                                                        │
  │◄─────── {"type":"next","id":"1",                       │
  │          "payload":{"data":{"channel":{...}}}} ────────│
  │                                                        │
  │──────── {"type":"complete","id":"1"} ─────────────────►│
  │                                                        │
  │◄─────── {"type":"complete","id":"1"} ──────────────────│
```

### Error Codes

| Code | Meaning                  | When Used                              |
| ---- | ------------------------ | -------------------------------------- |
| 4400 | Bad Request              | Invalid JSON, binary message, unknown type |
| 4401 | Unauthorized             | Subscribe before ConnectionAck         |
| 4403 | Forbidden                | No owner set for channel               |
| 4408 | Connection Init Timeout  | No ConnectionInit within 10s           |
| 4429 | Too Many Requests        | Multiple ConnectionInit messages       |

---

## 9. Critical Implementation Details

### Authentication Flow

```
1. HTTP Request with Upgrade header arrives at Worker
2. Worker validates session via Pasaport
3. If valid: Route to UserChannel DO via idFromName(userId)
4. If invalid: Return HTTP 401 before upgrade
5. UserChannel DO trusts the routing (no re-validation needed)
```

### Error Handling Patterns

```typescript
// Library DO: Publish errors should not break mutations
private async publishToLibrary(event: LibraryEvent): Promise<void> {
  try {
    const userChannel = this.getUserChannel();
    await userChannel.publish("library", event);
  } catch (error) {
    // Log but don't throw - mutation succeeded, broadcast is best-effort
    console.error("Failed to publish event:", error);
  }
}

// UserChannel DO: Broadcast errors should not affect other connections
async publish(channel: string, event: ChannelEvent): Promise<void> {
  for (const ws of this.ctx.getWebSockets()) {
    try {
      // ... send logic ...
    } catch (error) {
      console.error("Failed to send to WebSocket:", error);
    }
  }
}
```

### Hibernation Considerations

1. **State Persistence**
   - Use `serializeAttachment()` for connection state
   - State survives DO hibernation (limit: 2KB per connection)

2. **Wake Behavior**
   - `webSocketMessage()` is called when DO wakes
   - All WebSockets from `getWebSockets()` are still valid

3. **No Alarms Needed**
   - graphql-ws client handles ping/pong
   - DO hibernates naturally when idle

---

## 10. File Changes Summary

### New Files

| File                                                    | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| `apps/worker/src/features/user-channel/UserChannel.ts`  | UserChannel DO implementation            |
| `apps/worker/src/features/user-channel/types.ts`        | TypeScript types for connection state    |
| `apps/worker/src/features/library/subscription-types.ts` | Library event type definitions           |
| `apps/worker/test/user-channel.spec.ts`                 | Tests for UserChannel DO                 |

### Modified Files

| File                                            | Changes                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| `apps/worker/src/features/library/Library.ts`   | Add `publishToLibrary()` calls to CRUD methods   |
| `apps/worker/src/index.ts`                      | Add WebSocket upgrade routing; Export UserChannel |
| `apps/worker/wrangler.jsonc`                    | Add USER_CHANNEL DO binding                      |
| `apps/kamp-us/src/relay/environment.ts`         | Add graphql-ws client and subscribe function     |
| `apps/kamp-us/src/pages/Library.tsx`            | Add useLibrarySubscription hook                  |
| `apps/kamp-us/src/auth/AuthContext.tsx`         | Call resetSubscriptionClient() on logout         |
| `apps/kamp-us/package.json`                     | Add graphql-ws dependency                        |

### Dependencies to Add

```json
// apps/kamp-us/package.json
{
  "dependencies": {
    "graphql-ws": "^5.16.0"
  }
}
```

---

## 11. Migration Path

### Phase 1: UserChannel DO
1. Create `UserChannel` DO with WebSocket handling
2. Add DO binding to wrangler.jsonc
3. Export from index.ts
4. Add WebSocket upgrade routing in worker
5. Test WebSocket connections work

### Phase 2: Library Integration
1. Add subscription types to Library
2. Add `publishToLibrary()` helper
3. Add publish calls to CRUD methods
4. Test events are received via WebSocket

### Phase 3: Frontend
1. Add graphql-ws dependency
2. Modify Relay environment
3. Add subscription hook to Library page
4. Handle store updates for totalCount

### Phase 4: Polish
1. Add error handling
2. Implement reconnection UI feedback
3. Add tests
4. Performance tuning

---

## Critical Files for Implementation

- `apps/worker/src/features/user-channel/UserChannel.ts` - New DO for WebSocket/channel management
- `apps/worker/src/features/library/Library.ts` - Add publish calls to existing CRUD methods
- `apps/worker/src/index.ts` - WebSocket upgrade routing, export UserChannel
- `apps/worker/wrangler.jsonc` - Add USER_CHANNEL binding
- `apps/kamp-us/src/relay/environment.ts` - graphql-ws client integration
- `apps/kamp-us/src/pages/Library.tsx` - Subscription hook
