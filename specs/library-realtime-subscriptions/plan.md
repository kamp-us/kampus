# Library Realtime Subscriptions - Implementation Plan

## Overview

This plan implements GraphQL subscriptions for the Library feature using a dedicated **UserChannel DO** for WebSocket management.

**Primary Test Case:** When a new story is created, `totalCount` updates in real-time on all subscribed clients.

---

## Phase 1: UserChannel DO Infrastructure

### 1.1 Create UserChannel DO Types

**File:** `apps/worker/src/features/user-channel/types.ts`

```typescript
// Connection state types
export interface AwaitingInitState {
  state: "awaiting_init";
  connectedAt: number;
}

export interface ReadyState {
  state: "ready";
  userId: string;
  subscriptions: Record<string, string>; // channel -> subscriptionId
}

export type ConnectionState = AwaitingInitState | ReadyState;

// Generic channel event
export interface ChannelEvent {
  type: string;
  [key: string]: unknown;
}
```

- [ ] Create `types.ts` with connection state interfaces
- [ ] Export `ConnectionState`, `ChannelEvent` types

### 1.2 Create UserChannel DO

**File:** `apps/worker/src/features/user-channel/UserChannel.ts`

- [ ] Create `UserChannel` class extending `DurableObject<Env>`
- [ ] Implement `setOwner(userId)` method
- [ ] Implement `fetch()` for WebSocket upgrade
  - Check `Upgrade: websocket` header
  - Validate `Sec-WebSocket-Protocol: graphql-transport-ws`
  - Create `WebSocketPair`
  - Call `ctx.acceptWebSocket(server)`
  - Set initial state via `serializeAttachment()`
  - Return 101 response with client WebSocket
- [ ] Implement `webSocketMessage()` handler
  - Parse JSON message
  - Handle `connection_init` → validate, send `connection_ack`
  - Handle `subscribe` → extract channel name, register subscription
  - Handle `complete` → remove subscription
  - Handle `ping` → send `pong`
- [ ] Implement `webSocketClose()` handler (logging only)
- [ ] Implement `publish(channel, event)` RPC method
  - Get all WebSockets via `ctx.getWebSockets()`
  - Filter by channel subscription
  - Send `next` message to each
- [ ] Implement `getConnectionCount()` helper
- [ ] Implement `getSubscriberCount(channel)` helper

### 1.3 Configure UserChannel DO Binding

**File:** `apps/worker/wrangler.jsonc`

- [ ] Add `USER_CHANNEL` binding to `durable_objects.bindings`

```jsonc
{
  "name": "USER_CHANNEL",
  "class_name": "UserChannel"
}
```

### 1.4 Export UserChannel from Worker

**File:** `apps/worker/src/index.ts`

- [ ] Import `UserChannel` class
- [ ] Add to exports: `export { UserChannel }`

### 1.5 Add WebSocket Upgrade Routing

**File:** `apps/worker/src/index.ts`

- [ ] Add middleware before GraphQL Yoga for `/graphql` route
- [ ] Check for `Upgrade: websocket` header
- [ ] Validate session via Pasaport
- [ ] If unauthenticated, return 401
- [ ] Route to `USER_CHANNEL.get(idFromName(userId))`
- [ ] Forward request via `userChannel.fetch(request)`

### 1.6 Update Env Type

**File:** `apps/worker/src/index.ts` or `worker-configuration.d.ts`

- [ ] Add `USER_CHANNEL: DurableObjectNamespace<UserChannel>` to Env interface

---

## Phase 2: Library DO Integration

### 2.1 Create Library Event Types

**File:** `apps/worker/src/features/library/subscription-types.ts`

```typescript
export interface StoryPayload {
  id: string;
  url: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface TagPayload {
  id: string;
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

- [ ] Create `subscription-types.ts` with event types
- [ ] Export `LibraryEvent`, `StoryPayload`, `TagPayload`

### 2.2 Add Publish Helpers to Library DO

**File:** `apps/worker/src/features/library/Library.ts`

- [ ] Add `ownerId` private field (load in constructor)
- [ ] Add `getUserChannel()` helper method
- [ ] Add `publishToLibrary(event)` helper method (try/catch, best-effort)
- [ ] Add `publishLibraryChange()` helper (counts query + publish)
- [ ] Add `toStoryPayload()` helper for serialization
- [ ] Add `toTagPayload()` helper for serialization

### 2.3 Add Publish Calls to Story Methods

**File:** `apps/worker/src/features/library/Library.ts`

- [ ] `createStory()` - Add `publishToLibrary({type: "story:create", ...})` + `publishLibraryChange()`
- [ ] `updateStory()` - Add `publishToLibrary({type: "story:update", ...})`
- [ ] `deleteStory()` - Add `publishToLibrary({type: "story:delete", ...})` + `publishLibraryChange()`

### 2.4 Add Publish Calls to Tag Methods

**File:** `apps/worker/src/features/library/Library.ts`

- [ ] `createTag()` - Add `publishToLibrary({type: "tag:create", ...})` + `publishLibraryChange()`
- [ ] `updateTag()` - Add `publishToLibrary({type: "tag:update", ...})`
- [ ] `deleteTag()` - Add `publishToLibrary({type: "tag:delete", ...})` + `publishLibraryChange()`

### 2.5 Add Publish Calls to Tagging Methods

**File:** `apps/worker/src/features/library/Library.ts`

- [ ] `tagStory()` - Add `publishToLibrary({type: "story:tag", ...})`
- [ ] `untagStory()` - Add `publishToLibrary({type: "story:untag", ...})`
- [ ] `setStoryTags()` - Add publish calls for added/removed tags

---

## Phase 3: Frontend Integration

### 3.1 Add graphql-ws Dependency

**File:** `apps/kamp-us/package.json`

- [ ] Add `"graphql-ws": "^5.16.0"` to dependencies
- [ ] Run `pnpm install`

### 3.2 Create Subscription Client

**File:** `apps/kamp-us/src/relay/environment.ts`

- [ ] Import `createClient` from `graphql-ws`
- [ ] Create `createSubscriptionClient()` function
  - Build WebSocket URL from `window.location`
  - Configure `retryAttempts: Infinity`
  - Configure exponential backoff in `retryWait`
  - Add connection event logging
- [ ] Create `getSubscriptionClient()` singleton getter
- [ ] Create `resetSubscriptionClient()` for auth changes

### 3.3 Add Subscribe Function to Relay Network

**File:** `apps/kamp-us/src/relay/environment.ts`

- [ ] Create `subscribe: SubscribeFunction`
  - Return `Observable.create()`
  - Use `client.subscribe()` from graphql-ws
  - Map responses to Relay format
- [ ] Update `Network.create(fetchQuery, subscribe)` to include subscribe

### 3.4 Reset Subscription on Logout

**File:** `apps/kamp-us/src/auth/AuthContext.tsx`

- [ ] Import `resetSubscriptionClient` from environment
- [ ] Call `resetSubscriptionClient()` in logout handler

### 3.5 Create Library Subscription Hook

**File:** `apps/kamp-us/src/pages/Library.tsx`

- [ ] Add `LibraryChannelSubscription` GraphQL subscription
  ```graphql
  subscription LibraryChannelSubscription {
    channel(name: "library") {
      ... on LibraryChangeEvent {
        type
        totalStories
        totalTags
      }
    }
  }
  ```
- [ ] Create `useLibrarySubscription(connectionId)` hook
  - Use `useSubscription` from react-relay
  - Handle `library:change` events in `updater`
  - Update `totalCount` on connection record

### 3.6 Integrate Subscription in Library Page

**File:** `apps/kamp-us/src/pages/Library.tsx`

- [ ] Get `__id` from stories connection for `connectionId`
- [ ] Call `useLibrarySubscription(connectionId)` in `AuthenticatedLibrary`

### 3.7 Run Relay Compiler

- [ ] Run `pnpm --filter kamp-us run relay` to generate subscription artifacts

---

## Phase 4: GraphQL Schema (Optional)

> Note: The subscription schema is optional since events flow through UserChannel DO directly, not through GraphQL Yoga. However, defining the schema enables introspection and Relay compiler validation.

### 4.1 Add Subscription Schema Types

**File:** `apps/worker/src/index.ts`

- [ ] Define `StoryPayloadType` Effect Schema
- [ ] Define `TagPayloadType` Effect Schema
- [ ] Define event types (StoryCreateEvent, etc.)
- [ ] Define `LibraryChannelEvent` union
- [ ] Create subscription resolver placeholder

---

## Phase 5: Testing & Polish

### 5.1 Manual Testing

- [ ] Start dev servers (`turbo run dev`)
- [ ] Open Library page in two browser tabs
- [ ] Create story in Tab A
- [ ] Verify Tab B shows updated `totalCount` without refresh
- [ ] Check browser Network tab for WebSocket messages
- [ ] Test reconnection by stopping/starting worker

### 5.2 Add Unit Tests

**File:** `apps/worker/test/user-channel.spec.ts`

- [ ] Test: WebSocket upgrade with valid auth returns 101
- [ ] Test: WebSocket upgrade without auth returns 401
- [ ] Test: Invalid protocol returns 400
- [ ] Test: ConnectionInit → ConnectionAck flow
- [ ] Test: Subscribe registers channel
- [ ] Test: Publish sends to subscribers only

### 5.3 Error Handling

- [ ] Verify publish errors don't break mutations
- [ ] Verify WebSocket errors close connection gracefully
- [ ] Verify reconnection works after disconnect

### 5.4 Documentation

- [ ] Update CLAUDE.md with UserChannel patterns if needed
- [ ] Mark feature as complete in `specs/README.md`

---

## File Checklist

### New Files
- [ ] `apps/worker/src/features/user-channel/UserChannel.ts`
- [ ] `apps/worker/src/features/user-channel/types.ts`
- [ ] `apps/worker/src/features/library/subscription-types.ts`
- [ ] `apps/worker/test/user-channel.spec.ts`

### Modified Files
- [ ] `apps/worker/wrangler.jsonc` - Add USER_CHANNEL binding
- [ ] `apps/worker/src/index.ts` - Export UserChannel, add WebSocket routing
- [ ] `apps/worker/src/features/library/Library.ts` - Add publish calls
- [ ] `apps/kamp-us/package.json` - Add graphql-ws
- [ ] `apps/kamp-us/src/relay/environment.ts` - Add subscription client
- [ ] `apps/kamp-us/src/pages/Library.tsx` - Add subscription hook
- [ ] `apps/kamp-us/src/auth/AuthContext.tsx` - Reset subscription on logout

---

## Implementation Order

```
Phase 1: UserChannel DO Infrastructure
  1.1 types.ts
  1.2 UserChannel.ts
  1.3 wrangler.jsonc
  1.4 Export from index.ts
  1.5 WebSocket routing
  1.6 Env type

Phase 2: Library Integration
  2.1 subscription-types.ts
  2.2 Publish helpers
  2.3-2.5 Publish calls in methods

Phase 3: Frontend
  3.1 graphql-ws dependency
  3.2-3.3 Subscription client
  3.4 Reset on logout
  3.5-3.6 Subscription hook
  3.7 Relay compiler

Phase 4: Schema (optional)
  4.1 Subscription schema types

Phase 5: Testing
  5.1 Manual testing
  5.2 Unit tests
  5.3 Error handling
  5.4 Documentation
```

---

## Success Criteria

- [ ] WebSocket connection established at `/graphql`
- [ ] `graphql-ws` protocol handshake succeeds
- [ ] Unauthenticated requests rejected with 401
- [ ] Subscribe to "library" channel works
- [ ] `story:create` event received on story creation
- [ ] `library:change` event includes updated counts
- [ ] `totalCount` updates in Relay store without refetch
- [ ] Two tabs show synced `totalCount` after mutation
- [ ] Reconnection works after disconnect
- [ ] DO hibernates with idle connections
