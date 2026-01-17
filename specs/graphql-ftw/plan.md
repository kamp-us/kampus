# Implementation Plan: GraphQL + Relay Data Layer

Derived from [design.md](./design.md). RFC: https://github.com/kamp-us/kampus/issues/23

## Progress

- [ ] Phase 1: Spellbook Layer
- [ ] Phase 2: Spellcaster + RequestResolver
- [ ] Phase 3: GraphQL Schema
- [ ] Phase 4: Relay Frontend

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

- [ ] Flatten to named exports (`export const getStory = ...`)
- [ ] Add `getBatchStory` implementation
- [ ] Add `getBatchTag` implementation
- [ ] Remove `.pipe(Effect.orDie)` from all handlers (Spellbook will handle)

### 1.3 Auto-catch SqlError in Spellbook
**File:** `apps/worker/src/shared/Spellbook.ts`

- [ ] Add `wrapHandlers()` function
- [ ] Apply to handlers in `Spellbook.make()`

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

- [ ] `GetStory` request type
- [ ] `GetTag` request type

### 2.3 Create LibraryClient service
**File:** `apps/worker/src/graphql/resolvers/LibraryClient.ts`

- [ ] `LibraryClient` Context.Tag
- [ ] `makeLibraryClientLayer(env, userId)` factory

### 2.4 Create RequestResolvers
**File:** `apps/worker/src/graphql/resolvers/StoryResolver.ts`
**File:** `apps/worker/src/graphql/resolvers/TagResolver.ts`

- [ ] `StoryResolver` with batching
- [ ] `TagResolver` with batching
- [ ] `loadStory(id)` helper
- [ ] `loadTag(id)` helper

---

## Phase 3: GraphQL Schema

### 3.1 Create Relay connection types
**File:** `apps/worker/src/graphql/connections.ts`

- [ ] `PageInfoType`
- [ ] `createConnectionTypes(nodeName, nodeType)` factory
- [ ] `toConnection(rpcResult)` transformer

### 3.2 Extend GraphQL schema
**File:** `apps/worker/src/graphql/schema.ts`

Types:
- [ ] `TagType`
- [ ] `StoryType` (implements Node, with `tags` resolver)
- [ ] `StoryEdgeType`, `StoryConnectionType`
- [ ] `WebPageType`
- [ ] `LibraryType` (namespace)

Queries:
- [ ] `library` field on QueryType
- [ ] `library.story(id)`
- [ ] `library.stories(first, after, tagId)` with `toConnection()`
- [ ] `library.tags`
- [ ] `library.webPage(url)`

Mutations:
- [ ] `CreateStoryInput`, `CreateStoryPayload`
- [ ] `UpdateStoryInput`, `UpdateStoryPayload`
- [ ] `DeleteStoryInput`, `DeleteStoryPayload`
- [ ] `CreateTagInput`, `CreateTagPayload`
- [ ] Mutation resolvers

### 3.3 Update GraphQL runtime
**File:** `apps/worker/src/graphql/runtime.ts`

- [ ] Add `LibraryClient` layer to per-request runtime
- [ ] Provide RequestResolvers

---

## Phase 4: Relay Frontend

### 4.1 Setup Relay
**File:** `apps/kamp-us/src/relay/environment.ts`

- [ ] Create `RelayEnvironment` with `fetchQuery`
- [ ] Configure credentials for auth

**File:** `apps/kamp-us/package.json`

- [ ] Add `react-relay`, `relay-runtime`
- [ ] Add `relay-compiler` (dev)
- [ ] Add relay-compiler script

### 4.2 Create Library page
**File:** `apps/kamp-us/src/pages/Library.tsx`

- [ ] `LibraryQuery` with `@connection`
- [ ] `StoryRow_story` fragment
- [ ] `CreateStoryMutation` with optimistic update
- [ ] `UpdateStoryMutation`
- [ ] `DeleteStoryMutation` with `@deleteRecord`
- [ ] `CreateTagMutation`
- [ ] Tag filter state (local)

### 4.3 Cleanup
**File:** `apps/kamp-us/src/rpc/atoms.ts`

- [ ] Remove `storiesAtom`
- [ ] Remove `storiesByTagAtom`
- [ ] Remove `tagsAtom`
- [ ] Remove `createStoryMutation`
- [ ] Remove `updateStoryMutation`
- [ ] Remove `deleteStoryMutation`
- [ ] Remove `createTagMutation`
- [ ] Remove `fetchUrlMetadataMutation`

**File:** `apps/kamp-us/src/pages/LibraryRpc.tsx`

- [ ] Delete file (replaced by Library.tsx)

---

## Files Summary

| Phase | File | Action |
|-------|------|--------|
| 1 | `packages/library/src/rpc.ts` | Add batch RPCs |
| 1 | `apps/worker/src/features/library/handlers.ts` | Flatten + batch |
| 1 | `apps/worker/src/shared/Spellbook.ts` | wrapHandlers |
| 2 | `apps/worker/src/shared/Spellcaster.ts` | Create |
| 2 | `apps/worker/src/graphql/requests.ts` | Create |
| 2 | `apps/worker/src/graphql/resolvers/LibraryClient.ts` | Create |
| 2 | `apps/worker/src/graphql/resolvers/StoryResolver.ts` | Create |
| 2 | `apps/worker/src/graphql/resolvers/TagResolver.ts` | Create |
| 3 | `apps/worker/src/graphql/connections.ts` | Create |
| 3 | `apps/worker/src/graphql/schema.ts` | Extend |
| 3 | `apps/worker/src/graphql/runtime.ts` | Update |
| 4 | `apps/kamp-us/src/relay/environment.ts` | Create |
| 4 | `apps/kamp-us/src/pages/Library.tsx` | Create |
| 4 | `apps/kamp-us/src/rpc/atoms.ts` | Remove library atoms |
| 4 | `apps/kamp-us/src/pages/LibraryRpc.tsx` | Delete |

---

## Verification

### After Phase 1
```bash
turbo run typecheck
pnpm --filter worker run test
```

### After Phase 2-3
```bash
turbo run typecheck
pnpm --filter worker run test

# Manual GraphQL test
pnpm --filter worker run dev
curl -X POST http://localhost:8787/graphql \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth-cookie>" \
  -d '{"query": "{ library { stories(first: 5) { edges { node { id title } } pageInfo { hasNextPage } } } }"}'
```

### After Phase 4
```bash
turbo run typecheck
pnpm --filter kamp-us run dev
# Test Library page in browser at /me/library
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| RequestResolver batching not working | Add logging, verify batch function receives multiple requests |
| Auth not passing through GraphQL | Check cookie forwarding, validate session in `library` resolver |
| Relay compiler issues | Follow relay-compiler docs, check `__generated__` output |
| Breaking existing RPC clients | Keep RPC endpoints, only add batch versions |
