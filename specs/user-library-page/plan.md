# User Library Page - Implementation Plan

Derived from [design.md](./design.md).

## Implementation Phases

### Phase A: Backend - Library DO Methods
**Estimated Tasks:** 4

Add CRUD methods to Library Durable Object.

| # | Task | File |
|---|------|------|
| A1 | Add `listStories(options)` method with pagination | `apps/worker/src/features/library/Library.ts` |
| A2 | Add `getStory(id)` method | `apps/worker/src/features/library/Library.ts` |
| A3 | Add `updateStory(id, updates)` method | `apps/worker/src/features/library/Library.ts` |
| A4 | Update `deleteStory(id)` to check existence first | `apps/worker/src/features/library/Library.ts` |

**Validation:** `pnpm --filter worker run test`

---

### Phase B: Backend - GraphQL Schema
**Estimated Tasks:** 5

Add GraphQL types and resolvers for library operations.

| # | Task | File |
|---|------|------|
| B1 | Add GraphQL types (Story, StoryConnection, PageInfo, Payloads) | `apps/worker/src/index.ts` |
| B2 | Add Library type and `libraryResolver` with `stories` field | `apps/worker/src/index.ts` |
| B3 | Extend User type with `library` field | `apps/worker/src/index.ts` |
| B4 | Add `storyResolver` with mutations (create, update, delete) | `apps/worker/src/index.ts` |
| B5 | Weave resolvers into schema | `apps/worker/src/index.ts` |

**Validation:**
- `pnpm --filter worker exec tsc --noEmit`
- `pnpm --filter worker run test`
- Test GraphQL queries manually

---

### Phase C: Frontend - Setup
**Estimated Tasks:** 3

Set up routing and fetch updated schema.

| # | Task | File |
|---|------|------|
| C1 | Fetch GraphQL schema from backend | `pnpm --filter kamp-us run schema:fetch` |
| C2 | Add `/me/library` route | `apps/kamp-us/src/main.tsx` |
| C3 | Create Library page shell with auth redirect | `apps/kamp-us/src/pages/Library.tsx` |

**Validation:** Route accessible, redirects to login when not authenticated

---

### Phase D: Frontend - Story List
**Estimated Tasks:** 4

Implement story list with pagination.

| # | Task | File |
|---|------|------|
| D1 | Add GraphQL query for `me.library.stories` | `apps/kamp-us/src/pages/Library.tsx` |
| D2 | Create StoryList component with pagination fragment | `apps/kamp-us/src/components/library/StoryList.tsx` |
| D3 | Create StoryRow component (display state) | `apps/kamp-us/src/components/library/StoryRow.tsx` |
| D4 | Add styles for list and rows | `apps/kamp-us/src/components/library/*.module.css` |

**Validation:**
- `pnpm --filter kamp-us run relay`
- Stories display, pagination works

---

### Phase E: Frontend - Create Story
**Estimated Tasks:** 3

Implement create story form.

| # | Task | File |
|---|------|------|
| E1 | Create CreateStoryForm component (collapsed/expanded) | `apps/kamp-us/src/components/library/CreateStoryForm.tsx` |
| E2 | Add createStory mutation | `apps/kamp-us/src/components/library/CreateStoryForm.tsx` |
| E3 | Add Relay store updater to prepend new story | `apps/kamp-us/src/components/library/CreateStoryForm.tsx` |

**Validation:** Can create story, appears in list

---

### Phase F: Frontend - Edit & Delete
**Estimated Tasks:** 3

Implement edit and delete functionality.

| # | Task | File |
|---|------|------|
| F1 | Add editing state to StoryRow | `apps/kamp-us/src/components/library/StoryRow.tsx` |
| F2 | Add delete confirmation state to StoryRow | `apps/kamp-us/src/components/library/StoryRow.tsx` |
| F3 | Add overflow menu component | `apps/kamp-us/src/components/library/OverflowMenu.tsx` |

**Validation:** Can edit title, can delete with confirmation

---

### Phase G: Frontend - Empty State & Polish
**Estimated Tasks:** 3

Add empty state and polish loading states.

| # | Task | File |
|---|------|------|
| G1 | Create EmptyState component | `apps/kamp-us/src/components/library/EmptyState.tsx` |
| G2 | Add skeleton loading states | `apps/kamp-us/src/pages/Library.tsx` |
| G3 | Add page styles | `apps/kamp-us/src/pages/Library.module.css` |

**Validation:** Empty state shows, loading states work

---

### Phase H: Testing & Cleanup
**Estimated Tasks:** 3

Add tests and run final validation.

| # | Task | File |
|---|------|------|
| H1 | Add backend tests for story CRUD | `apps/worker/test/library-stories.spec.ts` |
| H2 | Run biome check and fix issues | `biome check --write .` |
| H3 | Run full validation | All checks pass |

**Validation:**
- `biome check --write .`
- `pnpm --filter worker exec tsc --noEmit`
- `pnpm --filter worker run test`
- `pnpm --filter kamp-us run relay`

---

## Task Checklist

### Phase A: Backend - Library DO Methods
- [ ] A1: Add `listStories(options)` method with pagination
- [ ] A2: Add `getStory(id)` method
- [ ] A3: Add `updateStory(id, updates)` method
- [ ] A4: Update `deleteStory(id)` to check existence first

### Phase B: Backend - GraphQL Schema
- [ ] B1: Add GraphQL types (Story, StoryConnection, PageInfo, Payloads)
- [ ] B2: Add Library type and `libraryResolver` with `stories` field
- [ ] B3: Extend User type with `library` field
- [ ] B4: Add `storyResolver` with mutations (create, update, delete)
- [ ] B5: Weave resolvers into schema

### Phase C: Frontend - Setup
- [ ] C1: Fetch GraphQL schema from backend
- [ ] C2: Add `/me/library` route
- [ ] C3: Create Library page shell with auth redirect

### Phase D: Frontend - Story List
- [ ] D1: Add GraphQL query for `me.library.stories`
- [ ] D2: Create StoryList component with pagination fragment
- [ ] D3: Create StoryRow component (display state)
- [ ] D4: Add styles for list and rows

### Phase E: Frontend - Create Story
- [ ] E1: Create CreateStoryForm component (collapsed/expanded)
- [ ] E2: Add createStory mutation
- [ ] E3: Add Relay store updater to prepend new story

### Phase F: Frontend - Edit & Delete
- [ ] F1: Add editing state to StoryRow
- [ ] F2: Add delete confirmation state to StoryRow
- [ ] F3: Add overflow menu component

### Phase G: Frontend - Empty State & Polish
- [ ] G1: Create EmptyState component
- [ ] G2: Add skeleton loading states
- [ ] G3: Add page styles

### Phase H: Testing & Cleanup
- [ ] H1: Add backend tests for story CRUD
- [ ] H2: Run biome check and fix issues
- [ ] H3: Run full validation

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/kamp-us/src/pages/Library.tsx` | Main library page |
| `apps/kamp-us/src/pages/Library.module.css` | Page styles |
| `apps/kamp-us/src/components/library/StoryList.tsx` | Paginated story list |
| `apps/kamp-us/src/components/library/StoryRow.tsx` | Story row (display/edit/delete) |
| `apps/kamp-us/src/components/library/StoryRow.module.css` | Row styles |
| `apps/kamp-us/src/components/library/CreateStoryForm.tsx` | Create story form |
| `apps/kamp-us/src/components/library/CreateStoryForm.module.css` | Form styles |
| `apps/kamp-us/src/components/library/EmptyState.tsx` | Empty library state |
| `apps/kamp-us/src/components/library/EmptyState.module.css` | Empty state styles |
| `apps/kamp-us/src/components/library/OverflowMenu.tsx` | Kebab menu component |
| `apps/worker/test/library-stories.spec.ts` | Backend story tests |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/worker/src/features/library/Library.ts` | Add listStories, getStory, updateStory methods |
| `apps/worker/src/features/library/schema.ts` | (Optional) Add Story type if needed |
| `apps/worker/src/index.ts` | Add GraphQL types and resolvers |
| `apps/kamp-us/src/main.tsx` | Add /me/library route |

---

## Validation Commands

```bash
# Backend type check
pnpm --filter worker exec tsc --noEmit

# Backend tests
pnpm --filter worker run test

# Fetch GraphQL schema
pnpm --filter kamp-us run schema:fetch

# Compile Relay artifacts
pnpm --filter kamp-us run relay

# Lint/format (changed files only)
biome check --write --staged

# Lint/format (all files)
biome check --write .
```

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| A: DO Methods | Not Started | |
| B: GraphQL | Not Started | |
| C: Frontend Setup | Not Started | |
| D: Story List | Not Started | |
| E: Create Story | Not Started | |
| F: Edit & Delete | Not Started | |
| G: Empty State | Not Started | |
| H: Testing | Not Started | |
