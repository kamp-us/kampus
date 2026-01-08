# Effect RPC Integration

## Feature Overview

Replace the GraphQL layer with Effect RPC for the Library feature, enabling end-to-end type safety through Effect Schema without code generation. This implementation runs in parallel with the existing GraphQL API, allowing gradual migration and comparison.

### Why This Feature

The current architecture uses GraphQL (GQLoom + Relay) which introduces several pain points:

1. **GraphQL overhead/complexity** - Schema definition, resolvers, and client-side fragments add layers of indirection
2. **Code generation dependency** - Relay compiler must run after schema changes to generate TypeScript types
3. **Effect integration gap** - While the backend uses Effect, the frontend uses Relay which doesn't integrate with Effect's error handling or service patterns
4. **Type duplication** - Effect Schema defines types that get translated to GraphQL, then re-generated as TypeScript on the client

Effect RPC + effect-atom provides:
- **Direct type sharing** - Same Effect Schema used on both ends, no codegen
- **End-to-end Effect** - Effect patterns from Durable Object to React component
- **Simpler mental model** - RPC procedures instead of GraphQL query/mutation/subscription semantics
- **Native real-time** - WebSocket transport with automatic reconnection

## User Stories

### As a frontend developer, I want to:

1. **Call backend procedures** with full type inference from shared Effect Schemas
2. **Use atoms for data fetching** that integrate with Effect services and error handling
3. **Subscribe to real-time updates** via WebSocket without separate subscription handling
4. **Implement optimistic updates** using effect-atom patterns
5. **Paginate through data** with cursor-based patterns similar to Relay connections
6. **Cache and invalidate data** using atom-based reactivity

### As a backend developer, I want to:

1. **Define RPC procedures** using Effect Schema with full type safety
2. **Expose the same Durable Object methods** through RPC without GraphQL resolver boilerplate
3. **Support both HTTP and WebSocket** transports from a single procedure definition
4. **Handle authentication** through Effect services/context
5. **Stream data to clients** using Effect Streams for real-time features

### As a system architect, I want to:

1. **Run RPC alongside GraphQL** during migration without conflicts
2. **Share Effect Schemas** between frontend and backend packages
3. **Maintain the actor model** - RPC still routes to Durable Objects
4. **Eventually migrate completely** from GraphQL if RPC proves superior

## Acceptance Criteria

### Backend RPC Server

- [ ] RPC group defined using `RpcGroup.make()` with Effect Schema
- [ ] Single `/rpc` endpoint handling both HTTP and WebSocket (upgrade)
- [ ] All Library DO operations exposed as RPC procedures:
  - [ ] `listStories` - paginated story list (stream for real-time)
  - [ ] `getStory` - single story by ID
  - [ ] `createStory` - create new story
  - [ ] `updateStory` - update existing story
  - [ ] `deleteStory` - delete story
  - [ ] `listTags` - all user tags
  - [ ] `createTag` - create new tag
  - [ ] `updateTag` - update tag
  - [ ] `deleteTag` - delete tag
  - [ ] `tagStory` - add tags to story
  - [ ] `untagStory` - remove tags from story
- [ ] Authentication via existing Better Auth session
- [ ] Proper error types using Effect tagged errors

### Frontend RPC Client

- [ ] RPC client configured with effect-atom's `AtomRpc`
- [ ] Atoms for each RPC procedure with proper Result types
- [ ] Story list atom with pagination support
- [ ] Real-time subscription atom for library changes
- [ ] Optimistic update patterns for mutations
- [ ] Error handling integrated with Result type

### Shared Types Package

- [ ] Effect Schemas for all RPC request/response types in shared location
- [ ] Story, Tag, and pagination schemas
- [ ] Error schemas for typed error handling
- [ ] Consumed by both `worker` and `kamp-us` apps

### Integration

- [ ] RPC works alongside existing GraphQL (no conflicts)
- [ ] Same authentication/session used for both
- [ ] Library page can be toggled between GraphQL and RPC implementations

## Constraints

### Technical Constraints

- **Cloudflare Workers** - RPC server runs in Worker environment
- **Durable Objects** - RPC routes requests to Library DO (actor model preserved)
- **Effect ecosystem** - `@effect/rpc` for RPC, `@effect/platform` for HTTP, `effect-atom` for frontend state
- **Parallel operation** - Cannot break existing GraphQL functionality

### Transport Constraints

- **Single endpoint** - `/rpc` handles both HTTP POST and WebSocket upgrade
- **Serialization** - NDJSON for streaming support (`RpcSerialization.layerNdjson`)
- **Service bindings** - Frontend Worker calls Backend Worker via binding (not external fetch)

### Schema Constraints

- **Effect Schema only** - No Zod, no plain TypeScript interfaces
- **Shared package** - Schemas in location importable by both apps
- **Serializable** - All types must be serializable (no class instances from DOs)

## Dependencies

- **@effect/rpc** - `RpcGroup`, `Rpc`, `RpcServer`, `RpcClient`, `RpcSerialization`
- **@effect/platform** - `HttpRouter`, `HttpClient`, `FetchHttpClient`
- **effect-atom** - `AtomRpc` for frontend RPC integration
- **Library Durable Object** - Existing DO to expose via RPC
- **Better Auth** - Existing auth system for session validation

## Out of Scope

The following are explicitly NOT part of this feature:

- **Full GraphQL replacement** - This is parallel implementation for Library only
- **Removing Relay** - GraphQL + Relay remains for other features
- **New Library features** - Only exposing existing functionality via RPC
- **Mobile clients** - Focus on web frontend only
- **Offline support** - No offline-first or service worker caching
- **Rate limiting** - Use existing Worker-level rate limiting if any
- **Schema versioning** - No backwards compatibility layer for schema changes
