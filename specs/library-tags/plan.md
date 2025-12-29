# Library Tags - Implementation Plan

Implementation roadmap derived from [design.md](./design.md).

## Overview

| Item | Value |
|------|-------|
| Branch | `feature/library-tags` |
| Estimated Tasks | 12 |
| Dependencies | None (extends existing Library DO) |

## Implementation Steps

### Step 1: Database Schema

- [ ] Add `tag` table to `drizzle.schema.ts`
- [ ] Add `storyTag` junction table to `drizzle.schema.ts`
- [ ] Generate migration:
  ```bash
  pnpm --filter worker exec drizzle-kit generate --config=./src/features/library/drizzle/drizzle.config.ts
  ```
- [ ] Verify generated SQL creates both tables with indexes

**Files:**
- `apps/worker/src/features/library/drizzle/drizzle.schema.ts`
- `apps/worker/src/features/library/drizzle/migrations/` (new file)

### Step 2: Type Definitions & Errors

- [ ] Create `schema.ts` with Effect Schema types (`Tag`, `CreateTagInput`, `UpdateTagInput`)
- [ ] Add tagged error classes (`TagNotFoundError`, `TagNameExistsError`, `StoryNotFoundError`)

**Files:**
- `apps/worker/src/features/library/schema.ts` (new file)

### Step 3: Tag CRUD Methods

- [ ] Implement `createTag(name, color)` with uniqueness check
- [ ] Implement `getTag(id)`
- [ ] Implement `listTags()`
- [ ] Implement `updateTag(id, updates)` with uniqueness check on name change
- [ ] Implement `deleteTag(id)` with cascade to `storyTag`

**Files:**
- `apps/worker/src/features/library/Library.ts`

### Step 4: Story-Tag Relationship Methods

- [ ] Implement `tagStory(storyId, tagIds)` - idempotent
- [ ] Implement `untagStory(storyId, tagIds)`
- [ ] Implement `getTagsForStory(storyId)` - join query
- [ ] Implement `getStoriesByTag(tagId)` - join query

**Files:**
- `apps/worker/src/features/library/Library.ts`

### Step 5: Tests

- [ ] Add test for tag creation (valid input)
- [ ] Add test for duplicate tag name rejection
- [ ] Add test for invalid color format rejection
- [ ] Add test for tag update
- [ ] Add test for tag deletion with cascade
- [ ] Add test for tagging a story
- [ ] Add test for idempotent tagging
- [ ] Add test for untagging
- [ ] Add test for `getTagsForStory`
- [ ] Add test for `getStoriesByTag`

**Files:**
- `apps/worker/test/library-tags.spec.ts` (new file)

### Step 6: Validation & Cleanup

- [ ] Run `biome check --write .`
- [ ] Run `pnpm --filter worker exec tsc --noEmit`
- [ ] Run `pnpm --filter worker run test`
- [ ] Manual smoke test with wrangler dev (optional)

## Task Order

```
Schema (Step 1)
    ↓
Types/Errors (Step 2)
    ↓
Tag CRUD (Step 3)
    ↓
Story-Tag Methods (Step 4)
    ↓
Tests (Step 5)
    ↓
Validation (Step 6)
```

## Progress Tracking

| Step | Status | Notes |
|------|--------|-------|
| 1. Database Schema | Not Started | |
| 2. Type Definitions | Not Started | |
| 3. Tag CRUD | Not Started | |
| 4. Story-Tag Methods | Not Started | |
| 5. Tests | Not Started | |
| 6. Validation | Not Started | |

## Definition of Done

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No Biome lint errors
- [ ] Migration generated and applied
- [ ] Code follows existing patterns in codebase
