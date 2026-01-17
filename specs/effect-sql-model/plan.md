# Plan: @effect/sql Model Abstraction

## Overview

Adopt @effect/sql Model abstraction in Library feature to replace raw SQL handlers with clean repo-based pattern.

## Implementation Steps

### Step 1: Create models.ts

**File:** `apps/worker/src/features/library/models.ts`

**Tasks:**
- [ ] Define Story Model.Class with fields matching DB schema
- [ ] Define Tag Model.Class with fields matching DB schema
- [ ] Create StoryRepo Effect.Service with makeRepository
- [ ] Create TagRepo Effect.Service with makeRepository
- [ ] Export RepoLayer combining both defaults

**Verification:** File compiles without errors

### Step 2: Create queries.ts

**File:** `apps/worker/src/features/library/queries.ts`

**Tasks:**
- [ ] Create listStoriesPaginated with SqlSchema.findAll
- [ ] Create makeTagsByStoryResolver with SqlResolver.grouped

**Verification:** File compiles without errors

### Step 3: Update Spellbook

**File:** `apps/worker/src/shared/Spellbook.ts`

**Tasks:**
- [ ] Add optional `layers` config to MakeConfig interface
- [ ] Merge layers into fullLayer composition

**Verification:** Existing tests still pass

### Step 4: Update Library.ts

**File:** `apps/worker/src/features/library/Library.ts`

**Tasks:**
- [ ] Import RepoLayer from models
- [ ] Pass RepoLayer to Spellbook.make()

**Verification:** Existing tests still pass

### Step 5: Refactor handlers (one at a time)

**File:** `apps/worker/src/features/library/handlers.ts`

**Order:**
1. [ ] getStory — read-only, lowest risk
2. [ ] createStory — uses repo.insert
3. [ ] updateStory — uses repo.update
4. [ ] deleteStory — uses repo.delete
5. [ ] listStories — uses pagination query
6. [ ] Tag handlers (listTags, createTag, updateTag, deleteTag)
7. [ ] Relationship handlers (getTagsForStory, setStoryTags)

**Pattern per handler:**
```typescript
// Before
const getStory = ({id}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<StoryRow>`SELECT * FROM story WHERE id = ${id}`
  // ...
})

// After
const getStory = ({id}) => Effect.gen(function* () {
  const repo = yield* StoryRepo
  const story = yield* repo.findById(id)
  // ...
})
```

**Verification:** Run tests after each handler

### Step 6: Update tests

**File:** `apps/worker/test/library-handlers.spec.ts`

**Tasks:**
- [ ] Update mock setup to provide StoryRepo/TagRepo if needed
- [ ] Verify all 51 tests pass

### Step 7: Cleanup

**Tasks:**
- [ ] Remove dead code (getTagsForStories unused function)
- [ ] Remove old StoryRow/TagRow interfaces if unused
- [ ] Run `biome check --write .`
- [ ] Run `turbo run typecheck`

## Files to Modify

| File | Action |
|------|--------|
| `apps/worker/src/features/library/models.ts` | Create |
| `apps/worker/src/features/library/queries.ts` | Create |
| `apps/worker/src/features/library/handlers.ts` | Refactor |
| `apps/worker/src/features/library/Library.ts` | Update |
| `apps/worker/src/shared/Spellbook.ts` | Update |
| `apps/worker/test/library-handlers.spec.ts` | Update |

## Verification Checklist

- [ ] `turbo run typecheck` passes
- [ ] `pnpm --filter worker run test` passes (51 tests)
- [ ] `biome check .` passes
- [ ] Manual test: create/list/update/delete story via dev server

## Rollback Plan

If issues arise:
1. Revert handlers.ts changes
2. Remove models.ts and queries.ts
3. Remove RepoLayer from Library.ts
4. Revert Spellbook.ts changes

Each step is independent — can revert partially if needed.

## Progress

- [ ] Step 1: models.ts
- [ ] Step 2: queries.ts
- [ ] Step 3: Spellbook update
- [ ] Step 4: Library.ts update
- [ ] Step 5: Handler refactoring
- [ ] Step 6: Test updates
- [ ] Step 7: Cleanup
