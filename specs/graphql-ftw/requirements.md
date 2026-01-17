# Requirements: GraphQL + Relay Data Layer

Derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR-1: Batch RPC Endpoints
- **FR-1.1**: `getBatchStory({ids: string[]})` returns `(Story | null)[]` preserving input order
- **FR-1.2**: `getBatchTag({ids: string[]})` returns `(Tag | null)[]` preserving input order
- **FR-1.3**: Empty ids array returns empty array (no DB call)

### FR-2: Spellcaster RPC Client Factory
- **FR-2.1**: `Spellcaster.make({rpcs, stub})` creates typed RPC client for DO stub
- **FR-2.2**: Client methods return Effects, not Promises
- **FR-2.3**: Uses existing Effect RPC protocol (HTTP + JSON serialization)

### FR-3: Effect RequestResolver (Batching)
- **FR-3.1**: `GetStory` request type for single story lookup
- **FR-3.2**: `GetTag` request type for single tag lookup
- **FR-3.3**: `StoryResolver` batches `GetStory` requests → calls `getBatchStory`
- **FR-3.4**: `TagResolver` batches `GetTag` requests → calls `getBatchTag`
- **FR-3.5**: Batching occurs within single Effect execution tick

### FR-4: GraphQL Schema - Types
- **FR-4.1**: `Story` type with fields: id, url, title, description, createdAt, tags
- **FR-4.2**: `Tag` type with fields: id, name, color
- **FR-4.3**: `WebPage` type with fields: url, title, description, error
- **FR-4.4**: `Library` namespace type for scoped queries
- **FR-4.5**: `PageInfo` type with: hasNextPage, hasPreviousPage, startCursor, endCursor
- **FR-4.6**: `StoryEdge` type with: node (Story), cursor (String)
- **FR-4.7**: `StoryConnection` type with: edges, pageInfo, totalCount
- **FR-4.8**: `Story` implements `Node` interface for Relay refetching
- **FR-4.9**: `createConnectionTypes()` factory for reusable connection pattern
- **FR-4.10**: `toConnection()` transforms RPC `{stories, hasNextPage, endCursor, totalCount}` → Relay format

### FR-5: GraphQL Schema - Queries
- **FR-5.1**: `library.story(id: ID!)` - single story by ID (batched via RequestResolver)
- **FR-5.2**: `library.stories(first, after, tagId?)` - paginated list with optional tag filter
- **FR-5.3**: `library.tags` - all user tags
- **FR-5.4**: `library.webPage(url: String!)` - fetch metadata from WebPageParser DO

### FR-6: GraphQL Schema - Mutations
- **FR-6.1**: `createStory(input: CreateStoryInput!)` returns `CreateStoryPayload`
- **FR-6.2**: `updateStory(input: UpdateStoryInput!)` returns `UpdateStoryPayload`
- **FR-6.3**: `deleteStory(input: DeleteStoryInput!)` returns `DeleteStoryPayload`
- **FR-6.4**: `createTag(input: CreateTagInput!)` returns `CreateTagPayload`
- **FR-6.5**: Mutation payloads include affected entity for Relay store updates

### FR-7: Relay Frontend
- **FR-7.1**: `RelayEnvironment` configured with fetchQuery to `/graphql`
- **FR-7.2**: `LibraryQuery` fetches stories connection + tags
- **FR-7.3**: `StoryRow_story` fragment colocates story data requirements
- **FR-7.4**: `useMutation` for create/update/delete with optimistic updates
- **FR-7.5**: `usePaginationFragment` for "Load More" functionality

### FR-8: Nested Field Resolution
- **FR-8.1**: `Story.tags` resolves via `TagResolver` (auto-batched)
- **FR-8.2**: All stories in a list share one batched `getBatchTag` call

## Non-Functional Requirements

### NFR-1: Performance
- **NFR-1.1**: N+1 queries eliminated via RequestResolver batching
- **NFR-1.2**: List queries do not use DataLoader (direct RPC call)
- **NFR-1.3**: Frontend normalized cache reduces redundant fetches

### NFR-2: Developer Experience
- **NFR-2.1**: Handlers exported as named functions (not object literal)
- **NFR-2.2**: SqlError auto-caught in Spellbook (no manual `.pipe(Effect.orDie)`)
- **NFR-2.3**: Type-safe GraphQL resolvers via `resolver()` helper

### NFR-3: Maintainability
- **NFR-3.1**: GraphQL schema is single source of API truth
- **NFR-3.2**: Frontend components own their data requirements via fragments
- **NFR-3.3**: No `reactivityKeys` manual cache invalidation

### NFR-4: Compatibility
- **NFR-4.1**: Auth handled at GraphQL layer (existing pattern)
- **NFR-4.2**: Existing `/graphql` endpoint extended (not replaced)
- **NFR-4.3**: effect-atom retained for local UI state

## Traceability

| Requirement | User Story | Acceptance Criteria |
|-------------|------------|---------------------|
| FR-1, FR-3 | US-4 (faster loads) | Batch RPCs, RequestResolvers |
| FR-2 | US-3 (API contract) | Spellcaster factory |
| FR-4, FR-5, FR-6 | US-3 (API contract) | GraphQL schema |
| FR-7 | US-1 (colocate data) | Relay fragments |
| FR-8 | US-4 (faster loads) | Nested field batching |
| NFR-2.2 | - | SqlError auto-caught |
| NFR-3.3 | US-2 (no reactivityKeys) | Relay normalized cache |

---

## Known Issues (Post-M2)

### BUG-1: Fetch URL Metadata Broken
**Severity:** High
**Status:** Open

The "Fetch" button in CreateStoryForm does not work. The GraphQL `fetchUrlMetadata` query fails silently.

**Root Cause:**
`makeWebPageParserClient` in `apps/worker/src/features/web-page-parser/client.ts` uses `@effect/platform`'s `FetchHttpClient.layer` which doesn't work in Cloudflare Workers runtime (same issue we fixed for Spellcaster).

**Fix Required:**
Rewrite `makeWebPageParserClient` to use direct fetch like Spellcaster does:
- Remove `FetchHttpClient.layer` dependency
- Use `Effect.promise(() => stub.fetch(...))` pattern
- Follow the same JSON protocol as Spellcaster

**Files:**
- `apps/worker/src/features/web-page-parser/client.ts` - rewrite client
- `apps/worker/src/graphql/schema.ts` - fetchUrlMetadata resolver may need updates

**Comparison (LibraryRpc.tsx):**
- Old implementation used `fetchUrlMetadataMutation` from effect-atom which worked via RPC
- New implementation calls GraphQL which calls broken WebPageParser client

### BUG-2: createStory null/undefined Mismatch
**Severity:** Medium
**Status:** Partially Fixed (delete/update fixed, create may still have issues)

GraphQL passes `null` for optional fields, but Effect Schema expects `undefined`.

**Root Cause:**
The `createStory` resolver passes `args.description ?? undefined` but if there are any code paths where null sneaks through, the RPC will fail with schema validation error.

**Evidence from logs:**
```
Expected string, actual null
Expected undefined, actual null
```

**Files:**
- `apps/worker/src/graphql/schema.ts` - createStory resolver

### MISSING-1: "Refreshing..." Indicator
**Severity:** Low
**Status:** Not implemented

LibraryRpc.tsx showed a "Refreshing..." indicator during background refetches:
```tsx
{waiting && <div className={styles.refreshing}>Refreshing...</div>}
```

The Relay implementation doesn't have this - Relay handles background updates differently.

**Decision needed:** Is this UX worth adding back?

### PARITY-1: Feature Parity Checklist

| Feature | LibraryRpc.tsx | Library.tsx (Relay) | Status |
|---------|---------------|---------------------|--------|
| Tag filter via URL | ✅ tagFilterAtom | ✅ tagFilterAtom | ✅ |
| Create story form | ✅ | ✅ | ✅ |
| Fetch URL metadata | ✅ fetchUrlMetadataMutation | ❌ GraphQL broken | **BUG-1** |
| Create tag inline | ✅ reactivityKeys | ✅ Relay mutation | ✅ |
| Tag input on create | ✅ | ✅ | ✅ |
| Tag input on edit | ✅ | ✅ | ✅ |
| Edit story | ✅ | ✅ | ✅ |
| Delete story | ✅ | ✅ | ✅ |
| Delete confirmation | ✅ | ✅ | ✅ |
| Tag filter bar | ✅ | ✅ | ✅ |
| Empty state | ✅ | ✅ | ✅ |
| Load More pagination | ⚠️ stub | ✅ usePaginationFragment | ✅ |
| Refreshing indicator | ✅ | ❌ | MISSING-1 |
| Optimistic updates | ❌ | ✅ | ✅ Improved |
| Normalized cache | ❌ | ✅ | ✅ Improved |
