# Implementation Plan: GraphQL + Relay Data Layer

Derived from [design.md](./design.md). RFC: https://github.com/kamp-us/kampus/issues/23

## Progress

- [x] Phase 1: Spellbook Layer
- [x] Phase 2: Spellcaster + RequestResolver
- [x] Phase 3: GraphQL Schema
- [x] Phase 4: Relay Frontend

---

## Phase 1: Spellbook Layer

### 1.1 Add batch RPCs
**File:** `packages/library/src/rpc.ts`

```typescript
Rpc.make("getBatchStory", {
  payload: {ids: Schema.Array(Schema.String)},
  success: Schema.Array(Schema.NullOr(Story)),
}),
Rpc.make("getBatchTag", {
  payload: {ids: Schema.Array(Schema.String)},
  success: Schema.Array(Schema.NullOr(Tag)),
}),
```

### 1.2 Implement batch handlers
**File:** `apps/worker/src/features/library/handlers.ts`

- [x] Flatten to named exports (`export const getStory = ...`)
- [x] Add `getBatchStory` implementation
- [x] Add `getBatchTag` implementation
- [x] Remove `.pipe(Effect.orDie)` from all handlers (Spellbook will handle)

### 1.3 Auto-catch SqlError in Spellbook
**File:** `apps/worker/src/shared/Spellbook.ts`

- [x] Add `wrapHandlers()` function
- [x] Apply to handlers in `Spellbook.make()`

---

## Phase 2: Spellcaster + RequestResolver

### 2.1 Create Spellcaster
**File:** `apps/worker/src/shared/Spellcaster.ts`

```typescript
export const make = <R extends Rpc.Any>(config: {
  rpcs: RpcGroup.RpcGroup<R>;
  stub: DurableObjectStub;
}) => Effect<RpcClient<R>>
```

### 2.2 Create Effect Request types
**File:** `apps/worker/src/graphql/requests.ts`

- [x] `GetStory` request type
- [x] `GetTag` request type

### 2.3 Create LibraryClient service
**File:** `apps/worker/src/graphql/resolvers/LibraryClient.ts`

- [x] `LibraryClient` Context.Tag
- [x] `LibraryClient.layer(env, userId)` static method

### 2.4 Create RequestResolvers
**File:** `apps/worker/src/graphql/resolvers/StoryResolver.ts`
**File:** `apps/worker/src/graphql/resolvers/TagResolver.ts`

- [x] `StoryResolver` with batching
- [x] `TagResolver` with batching
- [x] `loadStory(id)` helper
- [x] `loadTag(id)` helper

---

## Phase 3: GraphQL Schema

### 3.1 Create Relay connection types
**File:** `apps/worker/src/graphql/connections.ts`

- [x] `PageInfoType`
- [x] `createConnectionTypes(nodeName, nodeType)` factory
- [x] `toConnection(rpcResult)` transformer

### 3.2 Extend GraphQL schema
**File:** `apps/worker/src/graphql/schema.ts`

Types:
- [x] `TagType`
- [x] `StoryType` (implements Node, tags embedded in RPC response)
- [x] `StoryEdgeType`, `StoryConnectionType`
- [x] `WebPageType`
- [x] `LibraryType` (namespace)

Queries:
- [x] `me.library` field on QueryType
- [x] `library.story(id)`
- [x] `library.stories(first, after)` with `toConnection()`
- [x] `library.storiesByTag(tagName, first, after)` with `toConnection()`
- [x] `library.tags`
- [x] `library.webPage(url)` - uses Spellcaster for WebPageParser DO

Mutations:
- [x] `createStory` with `CreateStoryPayload`
- [x] `updateStory` with `UpdateStoryPayload` + error handling
- [x] `deleteStory` with `DeleteStoryPayload`
- [x] `createTag` with `CreateTagPayload` + error union
- [x] `updateTag` with `UpdateTagPayload` + error union
- [x] `deleteTag` with `DeleteTagPayload`

### 3.3 Update GraphQL runtime
**File:** `apps/worker/src/graphql/runtime.ts`

- [x] Add `LibraryClient` layer to per-request runtime
- [x] Enable request batching via `Effect.withRequestBatching(true)`

---

## Phase 4: Relay Frontend

### 4.1 Setup Relay
**File:** `apps/kamp-us/src/relay/environment.ts`

- [x] Create `RelayEnvironment` with `fetchQuery`
- [x] Configure Authorization header for token auth

**File:** `apps/kamp-us/package.json`

- [x] Add `react-relay`, `relay-runtime`
- [x] Add `relay-compiler` (dev)
- [x] Add relay-compiler script

### 4.2 Create Library page
**File:** `apps/kamp-us/src/pages/Library.tsx`

- [x] `LibraryQuery` with `@connection(key: "Library_stories")`
- [x] `LibraryByTagQuery` for filtered view
- [x] `Library_story` fragment (colocated data)
- [x] `Library_stories` fragment with `@refetchable` for pagination
- [x] `CreateStoryMutation` with optimistic update + updater
- [x] `UpdateStoryMutation` with optimistic update
- [x] `DeleteStoryMutation` with `@deleteRecord`
- [x] `CreateTagMutation`
- [x] Tag filter via `Atom.searchParam("tag")` (URL sync)
- [x] `usePaginationFragment` for Load More

### 4.3 Create TagManagement page
**File:** `apps/kamp-us/src/pages/library/TagManagement.tsx`

- [x] `TagManagementQuery` for tag listing with story counts
- [x] `UpdateTagMutation` with optimistic update
- [x] `DeleteTagMutation` with `@deleteRecord`

### 4.4 Cleanup
**File:** `apps/kamp-us/src/rpc/atoms.ts`

- [x] Remove `storiesAtom`
- [x] Remove `storiesByTagAtom`
- [x] Remove `tagsAtom`
- [x] Remove `createStoryMutation`
- [x] Remove `updateStoryMutation`
- [x] Remove `deleteStoryMutation`
- [x] Remove `createTagMutation`
- [x] Remove `fetchUrlMetadataMutation`
- [x] Remove `updateTagMutation`
- [x] Remove `deleteTagMutation`
- [x] Only `tagFilterAtom` remains (URL state sync)

**File:** `apps/kamp-us/src/pages/LibraryRpc.tsx`

- [x] Delete file (replaced by Library.tsx)

**File:** `apps/worker/src/features/web-page-parser/client.ts`

- [x] Delete file (replaced by Spellcaster.make usage)

---

## Files Summary

| Phase | File | Action | Status |
|-------|------|--------|--------|
| 1 | `packages/library/src/rpc.ts` | Add batch RPCs | ✅ |
| 1 | `apps/worker/src/features/library/handlers.ts` | Flatten + batch | ✅ |
| 1 | `apps/worker/src/shared/Spellbook.ts` | wrapHandlers | ✅ |
| 2 | `apps/worker/src/shared/Spellcaster.ts` | Create | ✅ |
| 2 | `apps/worker/src/graphql/requests.ts` | Create | ✅ |
| 2 | `apps/worker/src/graphql/resolvers/LibraryClient.ts` | Create | ✅ |
| 2 | `apps/worker/src/graphql/resolvers/StoryResolver.ts` | Create | ✅ |
| 2 | `apps/worker/src/graphql/resolvers/TagResolver.ts` | Create | ✅ |
| 3 | `apps/worker/src/graphql/connections.ts` | Create | ✅ |
| 3 | `apps/worker/src/graphql/schema.ts` | Extend | ✅ |
| 3 | `apps/worker/src/graphql/runtime.ts` | Update | ✅ |
| 4 | `apps/kamp-us/src/relay/environment.ts` | Create | ✅ |
| 4 | `apps/kamp-us/src/pages/Library.tsx` | Create | ✅ |
| 4 | `apps/kamp-us/src/pages/library/TagManagement.tsx` | Create | ✅ |
| 4 | `apps/kamp-us/src/rpc/atoms.ts` | Remove library atoms | ✅ |
| 4 | `apps/kamp-us/src/pages/LibraryRpc.tsx` | Delete | ✅ |
| 4 | `apps/worker/src/features/web-page-parser/client.ts` | Delete | ✅ |

---

## Verification ✅

All verification steps completed:

```bash
turbo run typecheck  # ✅ passes
turbo run test       # ✅ 82 tests pass
```

Manual E2E tests:
- [x] Library page loads and displays stories
- [x] Create story with optimistic update
- [x] Delete story with immediate removal
- [x] Pagination (Load More) works
- [x] Tag filter via URL works
- [x] Fetch URL metadata works
- [x] TagManagement page works

---

## Implementation Complete ✅

All phases complete. M1 + M2 milestones achieved.

**Key Deliverables:**
- 82 backend tests
- 30 PRD items passing
- Full feature parity with previous RPC implementation
- Improved: optimistic updates, normalized cache, pagination
