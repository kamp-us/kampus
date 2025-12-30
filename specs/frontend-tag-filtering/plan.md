# Frontend Tag Filtering - Implementation Plan

This document outlines the implementation roadmap for the frontend tag filtering feature based on [design.md](./design.md).

## Implementation Phases

### Phase 1: Backend - storiesByTag Query

**Goal:** Add GraphQL query to fetch stories filtered by tag name.

| Task | Files | Dependencies |
|------|-------|--------------|
| 1.1 Add `getStoriesByTagName` method to Library DO | `apps/worker/src/features/library/Library.ts` | None |
| 1.2 Add `storiesByTag` field resolver on Library type | `apps/worker/src/index.ts` | 1.1 |

**Checkpoint:** Run `pnpm --filter worker exec tsc --noEmit` and `pnpm --filter worker run test`

---

### Phase 2: Frontend - TagChip Enhancement

**Goal:** Add `to` prop to TagChip for link navigation.

| Task | Files | Dependencies |
|------|-------|--------------|
| 2.1 Add `to` prop to TagChip, render name as Link | `apps/kamp-us/src/design/TagChip.tsx` | None |
| 2.2 Add link hover styles | `apps/kamp-us/src/design/TagChip.module.css` | 2.1 |

**Checkpoint:** TagChip renders name as link when `to` prop is provided

---

### Phase 3: Relay Integration

**Goal:** Add filtered query and compile artifacts.

| Task | Files | Dependencies |
|------|-------|--------------|
| 3.1 Fetch updated schema | Run `pnpm --filter kamp-us run schema:fetch` | Phase 1 |
| 3.2 Add LibraryFilteredQuery for storiesByTag | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.3 Compile Relay artifacts | Run `pnpm --filter kamp-us run relay` | 3.2 |

**Checkpoint:** Relay compiler succeeds, artifacts generated

---

### Phase 4: URL State Management

**Goal:** Add useTagFilter hook for reading/managing URL state.

| Task | Files | Dependencies |
|------|-------|--------------|
| 4.1 Create `useTagFilter` hook | `apps/kamp-us/src/pages/Library.tsx` | None |
| 4.2 Add conditional query selection (all vs filtered) | `apps/kamp-us/src/pages/Library.tsx` | 3.2, 4.1 |

**Checkpoint:** URL param changes trigger correct query

---

### Phase 5: TagFilterRow Component

**Goal:** Add filter status bar with active tag and count.

| Task | Files | Dependencies |
|------|-------|--------------|
| 5.1 Create TagFilterRow component | `apps/kamp-us/src/pages/Library.tsx` | 2.1 |
| 5.2 Add TagFilterRow styles | `apps/kamp-us/src/pages/Library.module.css` | 5.1 |
| 5.3 Add dismiss button styles | `apps/kamp-us/src/pages/Library.module.css` | 5.1 |
| 5.4 Integrate TagFilterRow into Library page | `apps/kamp-us/src/pages/Library.tsx` | 5.1, 4.2 |

**Checkpoint:** Filter row shows current state and count

---

### Phase 6: StoryRow Tag Links

**Goal:** Make tags clickable to filter.

| Task | Files | Dependencies |
|------|-------|--------------|
| 6.1 Update StoryRow to pass `to` prop to TagChip | `apps/kamp-us/src/pages/Library.tsx` | 2.1 |

**Checkpoint:** Clicking tag navigates to filtered view

---

### Phase 7: Empty State

**Goal:** Handle zero results gracefully.

| Task | Files | Dependencies |
|------|-------|--------------|
| 7.1 Add FilteredEmptyState component | `apps/kamp-us/src/pages/Library.tsx` | None |
| 7.2 Render empty state when filter returns 0 stories | `apps/kamp-us/src/pages/Library.tsx` | 7.1, 4.2 |

**Checkpoint:** Empty state shows with clear action

---

### Phase 8: Polish & Testing

**Goal:** Final testing and edge case handling.

| Task | Files | Dependencies |
|------|-------|--------------|
| 8.1 Test direct URL navigation (`/me/library?tag=foo`) | Manual testing | All |
| 8.2 Test browser back/forward | Manual testing | All |
| 8.3 Test nonexistent tag in URL | Manual testing | 7.1 |
| 8.4 Test clicking different tag while filtered | Manual testing | 6.1 |
| 8.5 Run biome check | `biome check --write .` | All |
| 8.6 Run type check | `pnpm --filter worker exec tsc --noEmit` | All |

**Checkpoint:** All acceptance criteria met

---

## File Change Summary

### Modified Files

| File | Changes |
|------|---------|
| `apps/worker/src/features/library/Library.ts` | Add `getStoriesByTagName` method |
| `apps/worker/src/index.ts` | Add `storiesByTag` field resolver on Library |
| `apps/kamp-us/src/design/TagChip.tsx` | Add `to` prop, render name as Link |
| `apps/kamp-us/src/design/TagChip.module.css` | Add link hover styles |
| `apps/kamp-us/src/pages/Library.tsx` | Add TagFilterRow, useTagFilter, conditional queries, empty state |
| `apps/kamp-us/src/pages/Library.module.css` | Add TagFilterRow, DismissButton styles |

### Generated Files (auto)

| File | Purpose |
|------|---------|
| `apps/kamp-us/src/__generated__/*.graphql.ts` | Relay artifacts |

---

## Task Checklist

### Phase 1: Backend
- [ ] 1.1 Add `getStoriesByTagName` method to Library DO
- [ ] 1.2 Add `storiesByTag` field resolver on Library type

### Phase 2: TagChip Enhancement
- [ ] 2.1 Add `to` prop to TagChip
- [ ] 2.2 Add link hover styles

### Phase 3: Relay Integration
- [ ] 3.1 Fetch updated schema
- [ ] 3.2 Add LibraryFilteredQuery
- [ ] 3.3 Compile Relay artifacts

### Phase 4: URL State Management
- [ ] 4.1 Create `useTagFilter` hook
- [ ] 4.2 Add conditional query selection

### Phase 5: TagFilterRow Component
- [ ] 5.1 Create TagFilterRow component
- [ ] 5.2 Add TagFilterRow styles
- [ ] 5.3 Add dismiss button styles
- [ ] 5.4 Integrate TagFilterRow into Library page

### Phase 6: StoryRow Tag Links
- [ ] 6.1 Update StoryRow to pass `to` prop to TagChip

### Phase 7: Empty State
- [ ] 7.1 Add FilteredEmptyState component
- [ ] 7.2 Render empty state when filter returns 0 stories

### Phase 8: Polish & Testing
- [ ] 8.1 Test direct URL navigation
- [ ] 8.2 Test browser back/forward
- [ ] 8.3 Test nonexistent tag in URL
- [ ] 8.4 Test clicking different tag while filtered
- [ ] 8.5 Run biome check
- [ ] 8.6 Run type check

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | Complete | `getStoriesByTagName` + `storiesByTag` resolver added |
| Phase 2 | Complete | TagChip `to` prop added with Link support |
| Phase 3 | Pending | Need to run dev server to fetch schema + compile Relay |
| Phase 4 | Complete | `useTagFilter` hook implemented |
| Phase 5 | Complete | `TagFilterRow` component implemented |
| Phase 6 | Complete | StoryRow tags now link to filter |
| Phase 7 | Complete | `FilteredEmptyState` component implemented |
| Phase 8 | Pending | Need to test with dev servers |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tag name with special characters | URL encode tag names in links |
| Performance with many stories | Use indexed query on story_tags table |
| Race condition during filter switch | Relay handles request cancellation |

---

## Commands Reference

```bash
# Backend type check
pnpm --filter worker exec tsc --noEmit

# Backend tests
pnpm --filter worker run test

# Fetch GraphQL schema
pnpm --filter kamp-us run schema:fetch

# Compile Relay
pnpm --filter kamp-us run relay

# Format/lint
biome check --write .
```
