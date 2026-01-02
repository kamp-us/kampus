# Library Realtime Subscriptions

## Feature Overview

Implement real-time updates for the Library object via GraphQL subscriptions. When any change occurs in a Library (story CRUD, tag operations, associations), connected clients should receive updates automatically without polling.

**Why:** Currently, the Library uses a pull-based model where clients must refetch to see changes. This creates stale UI states and requires manual refresh or optimistic updates. Real-time subscriptions provide instant feedback and enable future collaborative features.

## User Stories

### As a library user:
- When I create a story in one browser tab, I want other tabs/devices to show the updated story list and count immediately
- When I delete a story, I want the totalCount to update in real-time across all connected clients
- When I add/remove tags from a story, I want the tag associations to reflect immediately
- When I create/update/delete tags, I want the tag list to update in real-time

### As a developer:
- I want a consistent pattern for implementing subscriptions on other features
- I want subscriptions to work with Cloudflare Workers' hibernatable WebSocket API for cost efficiency

## Acceptance Criteria

### Core Functionality
- [ ] GraphQL subscription endpoint available at `/graphql` alongside queries/mutations
- [ ] Clients can subscribe to Library changes using standard `graphql-ws` protocol
- [ ] Subscriptions are Library-scoped (each Library has its own subscription channel)

### Event Coverage
- [ ] `story:create` - Fires when a new story is added to the Library
- [ ] `story:update` - Fires when a story's title, description, or URL changes
- [ ] `story:delete` - Fires when a story is removed from the Library
- [ ] `tag:create` - Fires when a new tag is created
- [ ] `tag:update` - Fires when a tag's name or color changes
- [ ] `tag:delete` - Fires when a tag is removed
- [ ] `story:tag` - Fires when tags are added to a story
- [ ] `story:untag` - Fires when tags are removed from a story
- [ ] `library:change` - Meta event with updated counts (totalStories, totalTags)

### Frontend Integration
- [ ] Relay environment configured with WebSocket transport for subscriptions
- [ ] Library component subscribes to `library:change` for count updates
- [ ] Subscription automatically reconnects on connection loss

### Test Case (Primary)
- [ ] When a new story is created, `totalCount` updates in real-time on all subscribed clients without refetching

## Constraints

### Technical
- Must use Cloudflare Workers' Hibernatable WebSocket API for cost efficiency (DOs sleep during idle connections)
- Must work with existing GraphQL Yoga setup
- Must maintain compatibility with current Relay frontend patterns
- Library DO is the "atom of coordination" - subscriptions should be managed per-Library instance

### Protocol
- Use `graphql-ws` protocol (not legacy `subscriptions-transport-ws`)
- WebSocket endpoint should be the same `/graphql` path with protocol upgrade

## Dependencies

### Existing Infrastructure
- GraphQL Yoga v5.18.0 (already installed)
- `@graphql-yoga/subscription` v5.0.5 (installed but not used)
- Library Durable Object (per-user isolation)
- React Relay frontend

### New Dependencies (Likely)
- `graphql-ws` - Client-side WebSocket transport for Relay
- Possible: `@graphql-yoga/plugin-defer-stream` for streaming support

## Out of Scope

- Cross-Library subscriptions (e.g., global feed of all users' stories)
- Presence indicators (who is currently viewing the Library)
- Collaborative editing (real-time co-editing of story metadata)
- Offline support / subscription replay
- Rate limiting subscription events
- Subscription authentication beyond existing session auth

## Architecture Notes

### Current State
- Library DO uses RPC methods for all operations
- No WebSocket handlers exist in any DO
- GraphQL Yoga configured for queries/mutations only
- Frontend uses Relay without subscription transport

### Proposed Flow: UserChannel DO
A dedicated per-user **UserChannel DO** handles all WebSocket connections:

```
Browser WebSocket → Worker → UserChannel DO (WebSocket handler)
                              ├─ Accepts connection
                              ├─ Manages channel subscriptions
                              └─ Exposes publish(channel, event) RPC

Library.createStory() → SQLite insert → userChannel.publish("library", event)
```

### Key Design Decisions (Resolved)
1. **Separate UserChannel DO** - Not Library DO. Enables reuse for notifications, presence, etc.
2. **Channel-based pub/sub** - Clients subscribe to named channels (e.g., "library")
3. **Authentication at Worker level** - Validate session before routing to UserChannel DO
