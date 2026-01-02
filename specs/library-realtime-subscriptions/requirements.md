# Library Realtime Subscriptions - Requirements

## 1. Overview

This document specifies the requirements for implementing real-time GraphQL subscriptions for the Library feature. The system shall enable clients to receive automatic updates when Library data changes, eliminating the need for polling or manual refresh.

**Reference:** [instructions.md](./instructions.md)

## 2. Functional Requirements

### 2.1 Subscription Establishment

| ID     | Requirement                                                                              | Priority |
| ------ | ---------------------------------------------------------------------------------------- | -------- |
| FR-1.1 | System SHALL accept WebSocket connections at `/graphql` endpoint via protocol upgrade    | Must     |
| FR-1.2 | System SHALL support the `graphql-ws` subprotocol (NOT legacy `subscriptions-transport-ws`) | Must     |
| FR-1.3 | System SHALL route subscription connections to the appropriate Library DO based on authenticated user | Must     |
| FR-1.4 | System SHALL reject subscription connections from unauthenticated clients                | Must     |
| FR-1.5 | System SHALL support multiple concurrent WebSocket connections per Library               | Must     |
| FR-1.6 | System SHALL maintain connection state that survives DO hibernation                      | Must     |

### 2.2 Subscription Lifecycle

| ID     | Requirement                                                              | Priority |
| ------ | ------------------------------------------------------------------------ | -------- |
| FR-2.1 | System SHALL process `ConnectionInit` message and validate authentication | Must     |
| FR-2.2 | System SHALL respond with `ConnectionAck` on successful authentication   | Must     |
| FR-2.3 | System SHALL respond with `ConnectionError` on authentication failure    | Must     |
| FR-2.4 | System SHALL process `Subscribe` messages to register subscription interest | Must     |
| FR-2.5 | System SHALL process `Complete` messages to unsubscribe from events      | Must     |
| FR-2.6 | System SHALL gracefully handle `Ping`/`Pong` keep-alive messages         | Should   |
| FR-2.7 | System SHALL clean up subscription state on WebSocket close              | Must     |

### 2.3 Event Types and Payloads

The system SHALL emit the following subscription events:

| ID     | Event Type       | Trigger                              | Payload                              |
| ------ | ---------------- | ------------------------------------ | ------------------------------------ |
| FR-3.1 | `story:create`   | New story added to Library           | Story node with all fields           |
| FR-3.2 | `story:update`   | Story title, description, or URL changes | Updated Story node                   |
| FR-3.3 | `story:delete`   | Story removed from Library           | Deleted story global ID              |
| FR-3.4 | `tag:create`     | New tag created in Library           | Tag node with all fields             |
| FR-3.5 | `tag:update`     | Tag name or color changes            | Updated Tag node                     |
| FR-3.6 | `tag:delete`     | Tag removed from Library             | Deleted tag global ID                |
| FR-3.7 | `story:tag`      | Tags added to a story                | Story ID, added tag IDs              |
| FR-3.8 | `story:untag`    | Tags removed from a story            | Story ID, removed tag IDs            |
| FR-3.9 | `library:change` | Any of the above events              | Updated counts (totalStories, totalTags) |

### 2.4 Library-Scoped Channels

| ID     | Requirement                                                        | Priority |
| ------ | ------------------------------------------------------------------ | -------- |
| FR-4.1 | Subscriptions SHALL be scoped to individual Library instances      | Must     |
| FR-4.2 | Events SHALL only broadcast to subscribers of the affected Library | Must     |
| FR-4.3 | System SHALL NOT leak events across different users' Libraries     | Must     |
| FR-4.4 | Library DO SHALL manage its own subscriber connections directly    | Must     |

### 2.5 GraphQL Subscription Schema

| ID     | Requirement                                                                    | Priority |
| ------ | ------------------------------------------------------------------------------ | -------- |
| FR-5.1 | Schema SHALL define `Subscription` type with Library event fields              | Must     |
| FR-5.2 | Schema SHALL define union types for event payloads                             | Must     |
| FR-5.3 | All subscription event nodes SHALL use global IDs consistent with queries/mutations | Must     |
| FR-5.4 | Subscription operations SHALL be compilable by Relay compiler                  | Must     |

### 2.6 Frontend Integration

| ID     | Requirement                                                                  | Priority |
| ------ | ---------------------------------------------------------------------------- | -------- |
| FR-6.1 | Relay environment SHALL support WebSocket transport for subscriptions        | Must     |
| FR-6.2 | Frontend SHALL establish subscription on Library page mount                  | Must     |
| FR-6.3 | Frontend SHALL handle subscription events to update Relay store              | Must     |
| FR-6.4 | Frontend SHALL display updated `totalCount` without manual refetch           | Must     |
| FR-6.5 | Frontend SHALL automatically reconnect on connection loss                    | Must     |
| FR-6.6 | Frontend SHALL maintain subscription across browser tabs (per-tab connection) | Should   |

## 3. Non-Functional Requirements

### 3.1 Performance

| ID      | Requirement                                                  | Target            | Priority |
| ------- | ------------------------------------------------------------ | ----------------- | -------- |
| NFR-1.1 | Event delivery latency from mutation to subscriber           | < 100ms           | Must     |
| NFR-1.2 | WebSocket connection establishment time                      | < 500ms           | Must     |
| NFR-1.3 | Memory overhead per idle WebSocket connection                | < 1KB (hibernated) | Must     |
| NFR-1.4 | Subscriber notification SHALL be non-blocking for mutations  | -                 | Must     |

### 3.2 Reliability

| ID      | Requirement                                                                   | Priority |
| ------- | ----------------------------------------------------------------------------- | -------- |
| NFR-2.1 | System SHALL deliver events at-least-once to connected subscribers            | Must     |
| NFR-2.2 | System SHALL NOT guarantee message ordering across concurrent mutations       | -        |
| NFR-2.3 | System SHALL handle DO wake-from-hibernation without event loss for new events | Must     |
| NFR-2.4 | System SHALL survive DO relocation without client-visible disruption          | Should   |
| NFR-2.5 | Frontend SHALL implement exponential backoff for reconnection attempts        | Must     |

### 3.3 Cost Efficiency

| ID      | Requirement                                                                    | Priority |
| ------- | ------------------------------------------------------------------------------ | -------- |
| NFR-3.1 | System SHALL use Cloudflare Hibernatable WebSocket API                         | Must     |
| NFR-3.2 | DOs SHALL hibernate during idle periods with no active messages                | Must     |
| NFR-3.3 | System SHALL NOT poll or keep-alive more frequently than protocol requires     | Must     |
| NFR-3.4 | Connection metadata SHALL be stored via `serializeAttachment` to survive hibernation | Must     |

### 3.4 Security

| ID      | Requirement                                                          | Priority |
| ------- | -------------------------------------------------------------------- | -------- |
| NFR-4.1 | Authentication SHALL be validated on WebSocket upgrade request       | Must     |
| NFR-4.2 | Session validation SHALL use existing Pasaport authentication        | Must     |
| NFR-4.3 | Invalid/expired sessions SHALL result in connection termination      | Must     |
| NFR-4.4 | Subscription data SHALL only include data user is authorized to see  | Must     |
| NFR-4.5 | System SHALL NOT expose internal IDs in subscription payloads        | Must     |

### 3.5 Scalability

| ID      | Requirement                                                              | Priority |
| ------- | ------------------------------------------------------------------------ | -------- |
| NFR-5.1 | System SHALL support up to 100 concurrent WebSocket connections per Library | Must     |
| NFR-5.2 | Broadcast operations SHALL scale linearly with subscriber count          | Must     |
| NFR-5.3 | System SHALL NOT create global singleton DOs for subscription routing    | Must     |

## 4. Technical Requirements

### 4.1 Protocol Specification

| ID     | Requirement             | Details                          |
| ------ | ----------------------- | -------------------------------- |
| TR-1.1 | WebSocket subprotocol   | `graphql-transport-ws`           |
| TR-1.2 | Message format          | JSON per graphql-ws specification |
| TR-1.3 | Connection init timeout | 10 seconds                       |
| TR-1.4 | Ping/pong interval      | 30 seconds (optional)            |

### 4.2 graphql-ws Message Types

The system SHALL support the following message types:

**Client to Server:**
- `ConnectionInit` - Initial authentication payload
- `Subscribe` - Start subscription with operation and variables
- `Complete` - Stop subscription
- `Ping` - Keep-alive ping

**Server to Client:**
- `ConnectionAck` - Connection accepted
- `Next` - Subscription data event
- `Error` - Subscription error
- `Complete` - Subscription ended
- `Pong` - Keep-alive pong

### 4.3 Integration Points

| Component         | Integration Requirement                                |
| ----------------- | ------------------------------------------------------ |
| UserChannel DO    | New DO: Handle WebSocket connections and channel subscriptions |
| UserChannel DO    | Implement `fetch()` handler for WebSocket upgrade      |
| UserChannel DO    | Implement `webSocketMessage()` for graphql-ws protocol |
| UserChannel DO    | Implement `webSocketClose()` for cleanup               |
| UserChannel DO    | Expose `publish(channel, event)` RPC for other DOs     |
| Library DO        | Call `userChannel.publish("library", event)` on mutations |
| Worker entry      | Route WebSocket upgrades to UserChannel DO             |
| Relay environment | Add `subscriptionFunction` to Network.create           |
| graphql-ws client | Establish connection with auth token                   |

### 4.4 Data Format Specifications

#### Subscription Query Format

```graphql
subscription LibraryChanges {
  libraryChanged {
    __typename
    ... on StoryCreatedEvent {
      story { id title url description createdAt }
    }
    ... on StoryUpdatedEvent {
      story { id title url description }
    }
    ... on StoryDeletedEvent {
      deletedStoryId
    }
    ... on TagCreatedEvent {
      tag { id name color }
    }
    ... on TagUpdatedEvent {
      tag { id name color }
    }
    ... on TagDeletedEvent {
      deletedTagId
    }
    ... on StoryTaggedEvent {
      storyId
      tagIds
    }
    ... on StoryUntaggedEvent {
      storyId
      tagIds
    }
    ... on LibraryMetaChangedEvent {
      totalStories
      totalTags
    }
  }
}
```

#### Event Payload Example (JSON over WebSocket)

```json
{
  "id": "subscription-1",
  "type": "next",
  "payload": {
    "data": {
      "libraryChanged": {
        "__typename": "StoryCreatedEvent",
        "story": {
          "id": "U3Rvcnk6c3RvcnlfMTIz",
          "title": "New Story",
          "url": "https://example.com",
          "description": null,
          "createdAt": "2025-01-15T10:30:00Z"
        }
      }
    }
  }
}
```

### 4.5 Connection State (Serialized Attachment)

```typescript
interface SubscriptionConnectionState {
  userId: string;           // Authenticated user ID
  subscriptionId: string;   // Client-provided subscription ID
  subscribedAt: number;     // Timestamp for debugging
}
```

## 5. Constraints

### 5.1 Technical Constraints

| ID  | Constraint                                                            |
| --- | --------------------------------------------------------------------- |
| C-1 | MUST use Cloudflare Workers runtime (no Node.js APIs)                 |
| C-2 | MUST use Hibernatable WebSocket API for cost efficiency               |
| C-3 | MUST integrate with existing GraphQL Yoga setup                       |
| C-4 | MUST maintain Relay compatibility for frontend                        |
| C-5 | UserChannel DO handles WebSocket connections (per-user, reusable)     |
| C-6 | Library DO publishes events via UserChannel.publish() RPC             |
| C-7 | WebSocket connections are tied to UserChannel DO instance             |

### 5.2 Protocol Constraints

| ID   | Constraint                                                    |
| ---- | ------------------------------------------------------------- |
| C-8  | MUST use `graphql-ws` protocol (NOT `subscriptions-transport-ws`) |
| C-9  | WebSocket endpoint MUST be same `/graphql` path with upgrade  |
| C-10 | MUST support protocol upgrade negotiation                     |

### 5.3 Scope Constraints (Out of Scope)

| ID    | Explicitly Excluded                             |
| ----- | ----------------------------------------------- |
| OOS-1 | Cross-Library subscriptions (global feeds)      |
| OOS-2 | Presence indicators (who is viewing)            |
| OOS-3 | Collaborative editing (real-time co-editing)    |
| OOS-4 | Offline support / subscription replay           |
| OOS-5 | Rate limiting subscription events               |
| OOS-6 | Subscription authentication beyond session auth |

## 6. Assumptions

| ID  | Assumption                                                             |
| --- | ---------------------------------------------------------------------- |
| A-1 | Users have stable internet connections (no offline-first requirements) |
| A-2 | Session tokens can be validated via existing Pasaport flow             |
| A-3 | GraphQL Yoga's subscription primitives work with Cloudflare Workers    |
| A-4 | graphql-ws client library is compatible with browser WebSocket API     |
| A-5 | Relay compiler supports subscription operations in current version     |
| A-6 | WebSocket connections are per-browser-tab (not shared)                 |

## 7. Dependencies

### 7.1 Existing Infrastructure

| Dependency                   | Version | Usage                                     |
| ---------------------------- | ------- | ----------------------------------------- |
| GraphQL Yoga                 | 5.18.0  | GraphQL runtime with subscription support |
| @graphql-yoga/subscription   | 5.0.5   | PubSub primitives (installed, unused)     |
| Library DO                   | -       | Per-user state management                 |
| Pasaport DO                  | -       | Session validation                        |
| React Relay                  | 20.1.1  | Frontend GraphQL client                   |

### 7.2 New Dependencies (Required)

| Dependency   | Purpose                                   |
| ------------ | ----------------------------------------- |
| graphql-ws   | Client-side WebSocket transport for Relay |

### 7.3 Cloudflare APIs

| API                          | Purpose                                |
| ---------------------------- | -------------------------------------- |
| WebSocketPair                | Create client/server WebSocket pair    |
| ctx.acceptWebSocket()        | Accept hibernatable WebSocket          |
| ctx.getWebSockets()          | Get all connected WebSockets           |
| ws.serializeAttachment()     | Store connection state for hibernation |
| ws.deserializeAttachment()   | Restore connection state after wake    |
| webSocketMessage() handler   | Process messages after hibernation     |
| webSocketClose() handler     | Clean up on disconnect                 |

## 8. Acceptance Criteria

### 8.1 Primary Test Case

**Scenario:** Real-time totalCount update across clients

**Given:**
- User has two browser tabs open on Library page
- Both tabs have active subscription connections

**When:**
- User creates a new story in Tab A

**Then:**
- Tab A shows incremented totalCount (via mutation response)
- Tab B shows incremented totalCount (via subscription event)
- No manual refresh required in Tab B
- Latency from creation to Tab B update < 200ms

### 8.2 Validation Checklist

- [ ] WebSocket upgrade works at `/graphql` endpoint
- [ ] `graphql-ws` protocol handshake succeeds
- [ ] Unauthenticated connections are rejected
- [ ] `story:create` event fires on story creation
- [ ] `story:update` event fires on story modification
- [ ] `story:delete` event fires on story deletion
- [ ] `tag:create/update/delete` events fire appropriately
- [ ] `story:tag/untag` events fire on tag associations
- [ ] `library:change` event includes updated counts
- [ ] Events only reach subscribers of affected Library
- [ ] DO hibernates with idle connections
- [ ] DO wakes correctly on new messages
- [ ] Frontend reconnects automatically after disconnect
- [ ] Relay store updates from subscription events

## 9. Traceability

| Requirement | User Story                                                         |
| ----------- | ------------------------------------------------------------------ |
| FR-1.x      | "I want other tabs/devices to show updated story list immediately" |
| FR-3.1-3.3  | Story CRUD events for real-time updates                            |
| FR-3.4-3.6  | Tag CRUD events for real-time updates                              |
| FR-3.7-3.8  | Tag association events                                             |
| FR-3.9      | totalCount updates in real-time                                    |
| FR-6.5      | "Subscription automatically reconnects on connection loss"         |
| NFR-3.x     | "Hibernatable WebSocket API for cost efficiency"                   |
| TR-1.x      | "`graphql-ws` protocol (not legacy)"                               |

---

## Critical Files for Implementation

- `apps/worker/src/features/user-channel/UserChannel.ts` - New DO for WebSocket/channel management
- `apps/worker/src/features/library/Library.ts` - Add publish calls to existing CRUD methods
- `apps/worker/src/index.ts` - WebSocket upgrade routing, export UserChannel
- `apps/worker/wrangler.jsonc` - Add USER_CHANNEL DO binding
- `apps/kamp-us/src/relay/environment.ts` - graphql-ws client integration
- `apps/kamp-us/src/pages/Library.tsx` - Subscription hook
