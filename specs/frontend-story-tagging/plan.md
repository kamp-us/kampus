# Frontend Story Tagging - Implementation Plan

This document outlines the implementation roadmap for the frontend story tagging feature based on [design.md](./design.md).

## Implementation Phases

### Phase 1: Backend Foundation

**Goal:** Add GraphQL schema and resolvers for tags.

| Task | Files | Dependencies |
|------|-------|--------------|
| 1.1 Add `setStoryTags` method to Library DO | `apps/worker/src/features/library/Library.ts` | None |
| 1.2 Add NodeType.Tag to relay helpers | `apps/worker/src/graphql/relay.ts` | None |
| 1.3 Add Tag type schema with Node interface | `apps/worker/src/index.ts` | 1.2 |
| 1.4 Add `listTags` query resolver | `apps/worker/src/index.ts` | 1.3 |
| 1.5 Add `createTag` mutation resolver | `apps/worker/src/index.ts` | 1.3 |
| 1.6 Add `tags` field resolver on Story type | `apps/worker/src/index.ts` | 1.3 |
| 1.7 Update `createStory` mutation to accept `tagIds` | `apps/worker/src/index.ts` | 1.1 |
| 1.8 Update `updateStory` mutation to accept `tagIds` | `apps/worker/src/index.ts` | 1.1 |
| 1.9 Update `node` query to handle Tag type | `apps/worker/src/index.ts` | 1.3 |

**Checkpoint:** Run `pnpm --filter worker exec tsc --noEmit` and `pnpm --filter worker run test`

---

### Phase 2: Frontend Components

**Goal:** Build TagChip and TagInput design system components.

| Task | Files | Dependencies |
|------|-------|--------------|
| 2.1 Create TagChip component | `apps/kamp-us/src/design/TagChip.tsx` | None |
| 2.2 Create TagChip styles | `apps/kamp-us/src/design/TagChip.module.css` | 2.1 |
| 2.3 Create TagInput component | `apps/kamp-us/src/design/TagInput.tsx` | 2.1 |
| 2.4 Create TagInput styles | `apps/kamp-us/src/design/TagInput.module.css` | 2.3 |

**Checkpoint:** Components render correctly in isolation

---

### Phase 3: Relay Integration

**Goal:** Connect frontend to GraphQL with Relay queries and mutations.

| Task | Files | Dependencies |
|------|-------|--------------|
| 3.1 Fetch updated schema | Run `pnpm --filter kamp-us run schema:fetch` | Phase 1 |
| 3.2 Add LibraryTagsQuery | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.3 Add CreateTagMutation | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.4 Update StoryFragment to include tags | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.5 Update CreateStoryMutation with tagIds | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.6 Update UpdateStoryMutation with tagIds | `apps/kamp-us/src/pages/Library.tsx` | 3.1 |
| 3.7 Compile Relay artifacts | Run `pnpm --filter kamp-us run relay` | 3.2-3.6 |

**Checkpoint:** Relay compiler succeeds, artifacts generated

---

### Phase 4: Story Form Integration

**Goal:** Add TagInput to create and edit story forms.

| Task | Files | Dependencies |
|------|-------|--------------|
| 4.1 Create useAvailableTags hook | `apps/kamp-us/src/pages/Library.tsx` | 3.2, 3.3 |
| 4.2 Add TagInput to CreateStoryForm | `apps/kamp-us/src/pages/Library.tsx` | 2.3, 4.1 |
| 4.3 Wire CreateStoryForm to include tagIds in mutation | `apps/kamp-us/src/pages/Library.tsx` | 4.2, 3.5 |
| 4.4 Add TagInput to EditStoryForm (StoryRow edit mode) | `apps/kamp-us/src/pages/Library.tsx` | 2.3, 4.1 |
| 4.5 Pre-populate TagInput with existing story tags | `apps/kamp-us/src/pages/Library.tsx` | 4.4, 3.4 |
| 4.6 Wire EditStoryForm to include tagIds in mutation | `apps/kamp-us/src/pages/Library.tsx` | 4.4, 3.6 |

**Checkpoint:** Can create and edit stories with tags

---

### Phase 5: Story Row Tag Display

**Goal:** Display tags on each story row in the library list.

| Task | Files | Dependencies |
|------|-------|--------------|
| 5.1 Add tag display section to StoryRow | `apps/kamp-us/src/pages/Library.tsx` | 2.1, 3.4 |
| 5.2 Implement "+N more" overflow indicator | `apps/kamp-us/src/pages/Library.tsx` | 5.1 |
| 5.3 Style tag display inline with metadata | `apps/kamp-us/src/pages/Library.module.css` | 5.1 |

**Checkpoint:** Tags visible on story rows, overflow handled

---

### Phase 6: Polish & Testing

**Goal:** Final testing and edge case handling.

| Task | Files | Dependencies |
|------|-------|--------------|
| 6.1 Test keyboard-only workflow | Manual testing | Phase 4, 5 |
| 6.2 Test tag creation inline | Manual testing | Phase 4 |
| 6.3 Test tag removal | Manual testing | Phase 4 |
| 6.4 Verify color assignment cycling | Manual testing | Phase 4 |
| 6.5 Run biome check | `biome check --write .` | All |
| 6.6 Run type check | `pnpm --filter worker exec tsc --noEmit` | All |

**Checkpoint:** All acceptance criteria met

---

## File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/kamp-us/src/design/TagChip.tsx` | Tag display component |
| `apps/kamp-us/src/design/TagChip.module.css` | TagChip styles |
| `apps/kamp-us/src/design/TagInput.tsx` | Tag selection/creation component |
| `apps/kamp-us/src/design/TagInput.module.css` | TagInput styles |

### Modified Files

| File | Changes |
|------|---------|
| `apps/worker/src/features/library/Library.ts` | Add `setStoryTags` method |
| `apps/worker/src/graphql/relay.ts` | Add `NodeType.Tag` |
| `apps/worker/src/index.ts` | Add Tag schema, resolvers, update Story mutations |
| `apps/kamp-us/src/pages/Library.tsx` | Add tag queries, mutations, form integration, row display |
| `apps/kamp-us/src/pages/Library.module.css` | Add tag display styles |

### Generated Files (auto)

| File | Purpose |
|------|---------|
| `apps/kamp-us/src/__generated__/*.graphql.ts` | Relay artifacts |

---

## Task Checklist

### Phase 1: Backend Foundation
- [ ] 1.1 Add `setStoryTags` method to Library DO
- [ ] 1.2 Add NodeType.Tag to relay helpers
- [ ] 1.3 Add Tag type schema with Node interface
- [ ] 1.4 Add `listTags` query resolver
- [ ] 1.5 Add `createTag` mutation resolver
- [ ] 1.6 Add `tags` field resolver on Story type
- [ ] 1.7 Update `createStory` mutation to accept `tagIds`
- [ ] 1.8 Update `updateStory` mutation to accept `tagIds`
- [ ] 1.9 Update `node` query to handle Tag type

### Phase 2: Frontend Components
- [ ] 2.1 Create TagChip component
- [ ] 2.2 Create TagChip styles
- [ ] 2.3 Create TagInput component
- [ ] 2.4 Create TagInput styles

### Phase 3: Relay Integration
- [ ] 3.1 Fetch updated schema
- [ ] 3.2 Add LibraryTagsQuery
- [ ] 3.3 Add CreateTagMutation
- [ ] 3.4 Update StoryFragment to include tags
- [ ] 3.5 Update CreateStoryMutation with tagIds
- [ ] 3.6 Update UpdateStoryMutation with tagIds
- [ ] 3.7 Compile Relay artifacts

### Phase 4: Story Form Integration
- [ ] 4.1 Create useAvailableTags hook
- [ ] 4.2 Add TagInput to CreateStoryForm
- [ ] 4.3 Wire CreateStoryForm to include tagIds
- [ ] 4.4 Add TagInput to EditStoryForm
- [ ] 4.5 Pre-populate TagInput with existing tags
- [ ] 4.6 Wire EditStoryForm to include tagIds

### Phase 5: Story Row Tag Display
- [ ] 5.1 Add tag display section to StoryRow
- [ ] 5.2 Implement "+N more" overflow indicator
- [ ] 5.3 Style tag display inline with metadata

### Phase 6: Polish & Testing
- [ ] 6.1 Test keyboard-only workflow
- [ ] 6.2 Test tag creation inline
- [ ] 6.3 Test tag removal
- [ ] 6.4 Verify color assignment cycling
- [ ] 6.5 Run biome check
- [ ] 6.6 Run type check

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | Complete | Backend GraphQL schema and resolvers added |
| Phase 2 | Complete | TagChip and TagInput components created |
| Phase 3 | Complete | Relay queries, mutations, and fragments updated |
| Phase 4 | Complete | TagInput integrated into create/edit forms |
| Phase 5 | Complete | Tags displayed on story rows with overflow |
| Phase 6 | Complete | Type checks, tests, and lint all pass |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Base UI Combobox API mismatch | Check docs during implementation, adjust TagInput wrapper as needed |
| Relay fragment issues | Keep tags field simple (array, not connection) |
| Color palette exhaustion | Cycle through colors (modulo 8) |

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
