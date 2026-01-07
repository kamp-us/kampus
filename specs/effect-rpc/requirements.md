# Effect RPC Requirements

## Functional Requirements

### FR-1: RPC Server

#### FR-1.1: RPC Group Definition
- **FR-1.1.1**: Define `LibraryRpcs` group using `RpcGroup.make()` with all Library DO operations
- **FR-1.1.2**: Each RPC must specify `payload` schema (input) and `success` schema (output)
- **FR-1.1.3**: Streaming RPCs must use `RpcSchema.stream()` for paginated/real-time responses

#### FR-1.2: Story Operations
| RPC | Payload | Success | Notes |
|-----|---------|---------|-------|
| `getStory` | `{id: String}` | `Story \| null` | Returns null if not found |
| `listStories` | `{first?: Int, after?: String}` | `Stream<Story>` | Cursor-based pagination |
| `createStory` | `{url: String, title: String, description?: String}` | `Story` | Validates URL format |
| `updateStory` | `{id: String, title?: String, description?: String \| null}` | `Story \| null` | Partial updates |
| `deleteStory` | `{id: String}` | `{deleted: Boolean}` | Idempotent |

#### FR-1.3: Tag Operations
| RPC | Payload | Success | Notes |
|-----|---------|---------|-------|
| `getTag` | `{id: String}` | `Tag \| null` | Returns null if not found |
| `listTags` | `{}` | `Array<Tag>` | All tags for user |
| `createTag` | `{name: String, color: String}` | `Tag` | Validates name/color |
| `updateTag` | `{id: String, name?: String, color?: String}` | `Tag \| null` | Partial updates |
| `deleteTag` | `{id: String}` | `{deleted: Boolean}` | Cascade deletes associations |

#### FR-1.4: Tag-Story Relationship Operations
| RPC | Payload | Success | Notes |
|-----|---------|---------|-------|
| `tagStory` | `{storyId: String, tagIds: Array<String>}` | `{tagged: Boolean}` | Idempotent |
| `untagStory` | `{storyId: String, tagIds: Array<String>}` | `{untagged: Boolean}` | Idempotent |
| `setStoryTags` | `{storyId: String, tagIds: Array<String>}` | `{success: Boolean}` | Atomic replace |
| `getTagsForStory` | `{storyId: String}` | `Array<Tag>` | Tags on a story |
| `getStoriesByTag` | `{tagId: String, first?: Int, after?: String}` | `Stream<Story>` | Paginated |

#### FR-1.5: HTTP Handler & Routing
- **FR-1.5.1**: Mount Library RPC at `/rpc/library/*` path (domain-scoped routing)
- **FR-1.5.2**: Library DO serves RPC via `fetch()` handler using `RpcServer.layerProtocolHttp()`
- **FR-1.5.3**: Use JSON serialization (`RpcSerialization.layerJson`) for HTTP requests
- **FR-1.5.4**: Integrate with existing Worker fetch handler alongside GraphQL
- **FR-1.5.5**: Pattern supports future domains (e.g., `/rpc/pasaport/*`)

#### FR-1.6: Authentication
- **FR-1.6.1**: Worker validates session via `pasaport.validateSession(headers)`
- **FR-1.6.2**: Return 401 Unauthorized if `session?.user` is null
- **FR-1.6.3**: Route requests to user's Library DO via `env.LIBRARY.idFromName(userId)`
- **FR-1.6.4**: Forward request to Library DO's `fetch()` handler
- **FR-1.6.5**: Library DO trusts requests are authorized (worker enforces auth)

#### FR-1.7: Error Handling
- **FR-1.7.1**: Define tagged error types for each failure mode:
  - `StoryNotFoundError` - story ID doesn't exist
  - `TagNotFoundError` - tag ID doesn't exist
  - `TagNameExistsError` - duplicate tag name
  - `InvalidTagNameError` - validation failure
  - `InvalidTagColorError` - validation failure
  - `InvalidUrlError` - URL format validation
  - `UnauthorizedError` - no valid session
- **FR-1.7.2**: Errors must be serializable via Effect Schema

---

### FR-2: RPC Client

#### FR-2.1: Client Definition
- **FR-2.1.1**: Create `LibraryRpcClient` using `AtomRpc.Tag()` factory
- **FR-2.1.2**: Configure HTTP protocol layer pointing to `/rpc/library` endpoint
- **FR-2.1.3**: Use service binding for Worker-to-Worker communication (not external fetch)

#### FR-2.2: Query Atoms
- **FR-2.2.1**: `storyAtom(id)` → `Atom<Result<Story | null, Error>>`
- **FR-2.2.2**: `storiesAtom(options?)` → `Writable<PullResult<Story>, void>` (pull-based pagination)
- **FR-2.2.3**: `tagsAtom` → `Atom<Result<Array<Tag>, Error>>`
- **FR-2.2.4**: `tagAtom(id)` → `Atom<Result<Tag | null, Error>>`
- **FR-2.2.5**: `storyTagsAtom(storyId)` → `Atom<Result<Array<Tag>, Error>>`
- **FR-2.2.6**: `storiesByTagAtom(tagId, options?)` → `Writable<PullResult<Story>, void>`

#### FR-2.3: Mutation Atoms
- **FR-2.3.1**: `createStoryMutation` → function atom for story creation
- **FR-2.3.2**: `updateStoryMutation` → function atom for story updates
- **FR-2.3.3**: `deleteStoryMutation` → function atom for story deletion
- **FR-2.3.4**: `createTagMutation` → function atom for tag creation
- **FR-2.3.5**: `updateTagMutation` → function atom for tag updates
- **FR-2.3.6**: `deleteTagMutation` → function atom for tag deletion
- **FR-2.3.7**: `setStoryTagsMutation` → function atom for updating story tags

#### FR-2.4: Reactivity
- **FR-2.4.1**: Mutations must specify `reactivityKeys` to invalidate related queries
- **FR-2.4.2**: Story mutations invalidate: `stories`, `story:{id}`
- **FR-2.4.3**: Tag mutations invalidate: `tags`, `tag:{id}`, `storyTags:{storyId}`
- **FR-2.4.4**: Tagging mutations invalidate: `storyTags:{storyId}`, `storiesByTag:{tagId}`

#### FR-2.5: Optimistic Updates
- **FR-2.5.1**: `createStory` optimistically prepends to story list
- **FR-2.5.2**: `deleteStory` optimistically removes from story list
- **FR-2.5.3**: `updateStory` optimistically updates story in list
- **FR-2.5.4**: Rollback on mutation failure

---

### FR-3: Shared Types

#### FR-3.1: Schema Location
- **FR-3.1.1**: Create shared schemas in `packages/rpc-schemas/` or `apps/worker/src/rpc/schemas/`
- **FR-3.1.2**: Schemas must be importable by both `worker` and `kamp-us` apps

#### FR-3.2: Entity Schemas
```typescript
Story = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  createdAt: Schema.String, // ISO date string
})

Tag = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  createdAt: Schema.String, // ISO date string
})
```

#### FR-3.3: Error Schemas
- **FR-3.3.1**: All error types defined as `Schema.TaggedError` or equivalent
- **FR-3.3.2**: Errors include relevant context (e.g., `tagName` for `TagNameExistsError`)

---

### FR-4: Integration

#### FR-4.1: Parallel Operation
- **FR-4.1.1**: RPC endpoint at `/rpc/library/*` must not conflict with GraphQL at `/graphql`
- **FR-4.1.2**: Both systems use same authentication (Better Auth session)
- **FR-4.1.3**: Both systems route to same Library DO instances
- **FR-4.1.4**: Domain-scoped routing (`/rpc/{domain}/*`) allows future expansion

#### FR-4.2: RPC Test Route
- **FR-4.2.1**: New route at `/me/library-rpc` for RPC implementation
- **FR-4.2.2**: Duplicate existing Library components to new route (copy, don't abstract)
- **FR-4.2.3**: Replace Relay hooks with effect-atom RPC hooks
- **FR-4.2.4**: Full working example with same UX as GraphQL version
- **FR-4.2.5**: No shared abstractions initially - working code over DRY

---

## Non-Functional Requirements

### NFR-1: Performance

- **NFR-1.1**: RPC round-trip latency should be ≤ GraphQL for equivalent operations
- **NFR-1.2**: Streaming responses must start delivering data within 100ms
- **NFR-1.3**: Bundle size increase for RPC client should be < 50KB gzipped

### NFR-2: Type Safety

- **NFR-2.1**: Full type inference from RPC definition to React component
- **NFR-2.2**: No `any` types in RPC client usage
- **NFR-2.3**: Compile-time errors for schema mismatches

### NFR-3: Developer Experience

- **NFR-3.1**: No code generation step required (unlike Relay)
- **NFR-3.2**: Schema changes immediately reflected in both ends
- **NFR-3.3**: Clear error messages for RPC failures

### NFR-4: Compatibility

- **NFR-4.1**: Must work in Cloudflare Workers environment
- **NFR-4.2**: Must work with existing Vite build setup
- **NFR-4.3**: Must work with React 19 and effect-atom React hooks

### NFR-5: Reliability

- **NFR-5.1**: WebSocket reconnection on connection drop
- **NFR-5.2**: Graceful degradation if WebSocket unavailable (fall back to HTTP)
- **NFR-5.3**: Request timeout handling (configurable, default 30s)

---

## Data Requirements

### DR-1: Schema Compatibility

- **DR-1.1**: RPC schemas must match existing Library DO method signatures
- **DR-1.2**: Date fields serialized as ISO 8601 strings (not Date objects)
- **DR-1.3**: Nullable fields use `Schema.NullOr()` pattern

### DR-2: Pagination

- **DR-2.1**: Cursor-based pagination using story/tag IDs
- **DR-2.2**: Default page size: 20 items
- **DR-2.3**: Stream-based response for incremental loading

---

## Assumptions

1. ✅ **Confirmed**: Better Auth session cookies accessible via `pasaport.validateSession(headers)`
2. ✅ **Confirmed**: Service bindings work for RPC - `Fetcher` interface supports standard HTTP
3. ✅ **Confirmed**: Cloudflare Workers support outbound WebSocket via `new WebSocket(url)`
4. effect-atom's AtomRpc works in browser environment (not just Node)
5. @effect/rpc supports Cloudflare Workers runtime (uses standard fetch/WebSocket)
6. NDJSON serialization is suitable for all use cases (no need for msgpack)

---

## Open Questions - Resolved

### 1. Service binding transport
**Answer**: @effect/rpc works over service bindings. Service bindings expose `Fetcher` (HTTP interface). RPC uses `RpcServer.layerProtocolHttp()` on backend, frontend Worker proxies via `env.BACKEND.fetch()`.

### 2. WebSocket in Workers
**Answer**: Cloudflare Workers support `new WebSocket(url)` for outbound connections. However, Workers passing through WebSocket are billed for entire connection duration. Durable Objects have Hibernation API for cost reduction. **Recommendation**: Start with HTTP-only, add WebSocket later for subscriptions.

### 3. Shared package structure
**Answer**: Currently `packages/` is empty - codebase uses GraphQL for type sharing. **Options**:
- **Option A (Recommended)**: Create `packages/rpc-schemas/` as new shared package
- **Option B**: Put schemas in `apps/worker/src/rpc/` with TypeScript project references
- **Option C**: Inline schemas in both apps (not recommended - duplication)

### 4. Feature flag mechanism
**Answer**: Not needed for initial implementation. Instead:
- Create separate test route `/me/library-rpc` for RPC verification
- Keep existing Library page unchanged (GraphQL/Relay)
- Future: Once RPC is proven, consider migrating or adding toggle

---

## Future Considerations

### Library.tsx Modularization
The current `apps/kamp-us/src/pages/Library.tsx` is 1374 lines with:
- GraphQL fragments and queries
- Multiple React components (StoryRow, CreateStoryForm, etc.)
- Hooks (useAvailableTags, useTagFilter)
- UI utilities (formatRelativeDate, extractDomain)

**Potential refactor** (separate effort):
- Extract components to `src/pages/library/` directory
- Move hooks to `src/pages/library/hooks/`
- Move GraphQL to `src/pages/library/graphql/`
- This would make RPC integration cleaner when ready for production
