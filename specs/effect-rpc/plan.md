# Effect RPC Implementation Plan

## Overview

This plan breaks down the implementation into sequential tasks. Each task should result in working code that can be tested incrementally.

## Prerequisites

- [ ] Verify `@effect/rpc` is available in effect monorepo
- [ ] Verify `effect-atom` has `AtomRpc` exports

---

## Phase A: Domain Package Setup

### Task A1: Create `packages/library/` structure

**Files to create:**
- `packages/library/package.json`
- `packages/library/tsconfig.json`
- `packages/library/src/index.ts`

**Steps:**
1. Create directory structure
2. Add package.json with name `@kampus/library`
3. Add tsconfig.json extending root config
4. Add to `pnpm-workspace.yaml`
5. Run `pnpm install` to link package

### Task A2: Define entity schemas

**File:** `packages/library/src/schema.ts`

**Schemas:**
- `Story` - id, url, title, description, createdAt
- `Tag` - id, name, color, createdAt
- `PaginationInput` - first, after
- `StoriesPage` - stories, hasNextPage, endCursor, totalCount

### Task A3: Define domain errors

**File:** `packages/library/src/errors.ts`

**Errors:**
- `UnauthorizedError`
- `StoryNotFoundError`
- `TagNotFoundError`
- `TagNameExistsError`
- `InvalidTagNameError`
- `InvalidTagColorError`

### Task A4: Define RPC contract

**File:** `packages/library/src/rpc.ts`

**RPCs:**
- Story: `getStory`, `listStories`, `createStory`, `updateStory`, `deleteStory`
- Tag: `listTags`, `createTag`, `updateTag`, `deleteTag`
- Relations: `getTagsForStory`, `setStoryTags`

### Task A5: Export from index

**File:** `packages/library/src/index.ts`

Export all schemas, errors, and `LibraryRpcs`.

---

## Phase B: Backend RPC Server

### Task B1: Add RPC server to Library DO

**File:** `apps/worker/src/features/library/Library.ts`

**Changes:**
1. Import `@kampus/library` and Effect RPC modules
2. Add `rpcRuntime` field for ManagedRuntime
3. Initialize RPC runtime in `blockConcurrencyWhile`
4. Add `createRpcHandlers()` method returning handler implementations
5. Add `fetch()` handler that serves RPC

**Note:** Keep existing RPC methods unchanged - handlers call them directly.

### Task B2: Add worker route

**File:** `apps/worker/src/index.ts`

**Changes:**
1. Add `/rpc/library/*` route
2. Validate session via Pasaport
3. Return 401 if unauthorized
4. Forward to Library DO's fetch handler

---

## Phase C: Frontend RPC Client

### Task C1: Create RPC client

**File:** `apps/kamp-us/src/rpc/client.ts`

**Contents:**
- `LibraryRpcClient` using `AtomRpc.Tag()`
- Configure with `/rpc/library` URL
- Use JSON serialization and FetchHttpClient

### Task C2: Create query/mutation atoms

**File:** `apps/kamp-us/src/rpc/atoms.ts`

**Atoms:**
- `storiesAtom(options?)` - list stories with pagination
- `storyAtom(id)` - get single story
- `tagsAtom` - list all tags
- `storyTagsAtom(storyId)` - get tags for story
- `createStoryMutation`, `updateStoryMutation`, `deleteStoryMutation`
- `createTagMutation`, `updateTagMutation`, `deleteTagMutation`
- `setStoryTagsMutation`

### Task C3: Create RPC provider

**File:** `apps/kamp-us/src/rpc/Provider.tsx`

**Contents:**
- Create Registry instance
- Export `RpcProvider` wrapping `RegistryProvider`

### Task C4: Update frontend worker proxy

**File:** `apps/kamp-us/worker/index.ts`

**Changes:**
- Add condition to proxy `/rpc/*` to backend

---

## Phase D: Test Page

### Task D1: Create LibraryRpc page

**File:** `apps/kamp-us/src/pages/LibraryRpc.tsx`

**Approach:**
1. Copy existing `Library.tsx` as starting point
2. Remove all GraphQL/Relay imports and fragments
3. Replace with effect-atom hooks using RPC atoms
4. Use `Result.match` for loading/error/success states

### Task D2: Add route

**File:** `apps/kamp-us/src/App.tsx`

**Changes:**
- Add route `/me/library-rpc` pointing to `LibraryRpc` page
- Wrap with `RpcProvider` (or add to root)

---

## Phase E: Verification

### Task E1: End-to-end test

**Manual testing:**
1. Start dev servers (`turbo run dev`)
2. Log in to app
3. Navigate to `/me/library-rpc`
4. Verify stories load
5. Test create story
6. Test delete story
7. Verify tags display
8. Test tag operations

### Task E2: Type checking

```bash
pnpm --filter worker exec tsc --noEmit
pnpm --filter kamp-us exec tsc --noEmit
```

### Task E3: Lint check

```bash
biome check --write .
```

---

## Implementation Order

```
A1 → A2 → A3 → A4 → A5 → B1 → B2 → C1 → C2 → C3 → C4 → D1 → D2 → E1 → E2 → E3
```

**Checkpoints:**
- After A5: Domain package builds, can be imported
- After B2: RPC endpoint responds (can test with curl)
- After C4: Frontend can make RPC calls
- After D2: Full UI working

---

## Risk Mitigation

### Risk 1: Effect RPC API differences
**Mitigation:** Check effect monorepo source for actual API before implementing

### Risk 2: ManagedRuntime in DO constructor
**Mitigation:** May need to lazily initialize on first request if async init in constructor fails

### Risk 3: AtomRpc API differences
**Mitigation:** Check effect-atom source for actual API patterns

### Risk 4: Missing deleteStory method in Library DO
**Mitigation:** Add `deleteStory` method to Library DO as part of Task B1

---

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| A1 | Done | packages/library/ structure created |
| A2 | Done | Entity schemas (Story, Tag, etc.) |
| A3 | Done | Domain errors defined |
| A4 | Done | LibraryRpcs contract defined |
| A5 | Done | Exports configured |
| B1 | Done | RPC fetch handler in Library DO |
| B2 | Done | /rpc/library/* route with auth |
| C1 | Done | LibraryRpcClient with AtomRpc |
| C2 | Done | Query/mutation atoms |
| C3 | Done | RpcProvider component |
| C4 | Done | Frontend worker proxy |
| D1 | Pending | |
| D2 | Pending | |
| E1 | Pending | |
| E2 | Pending | |
| E3 | Pending | |
