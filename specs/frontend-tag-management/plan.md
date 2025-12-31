# Frontend Tag Management - Implementation Plan

**Derived from:** [design.md](./design.md)

## Implementation Phases

### Phase A: Backend - Add totalCount to Connections

**Goal:** Enable querying story counts on tags via `stories(first: 0) { totalCount }`

| Step | Task | File(s) |
|------|------|---------|
| A1 | Add `totalCount` field to `StoryConnection` schema | `apps/worker/src/index.ts` |
| A2 | Update `listStories` in Library DO to return totalCount | `apps/worker/src/features/library/Library.ts` |
| A3 | Update `storiesByTag` in Library DO to return totalCount | `apps/worker/src/features/library/Library.ts` |
| A4 | Update `libraryResolver.stories` to pass through totalCount | `apps/worker/src/index.ts` |
| A5 | Update `libraryResolver.storiesByTag` to pass through totalCount | `apps/worker/src/index.ts` |
| A6 | Add `stories` field resolver on Tag type | `apps/worker/src/index.ts` |
| A7 | Run tests, type check | - |

### Phase B: Frontend - ColorPicker Component

**Goal:** Create reusable ColorPicker design system component

| Step | Task | File(s) |
|------|------|---------|
| B1 | Create `ColorPicker.tsx` with Base UI Popover | `apps/kamp-us/src/design/ColorPicker.tsx` |
| B2 | Create `ColorPicker.module.css` with swatch grid | `apps/kamp-us/src/design/ColorPicker.module.css` |
| B3 | Export from design system index (if exists) | - |

### Phase C: Frontend - Tag Management Page

**Goal:** Create the `/library/tags` page with full CRUD

| Step | Task | File(s) |
|------|------|---------|
| C1 | Create `TagManagement.tsx` page component | `apps/kamp-us/src/pages/library/TagManagement.tsx` |
| C2 | Create `TagManagement.module.css` styles | `apps/kamp-us/src/pages/library/TagManagement.module.css` |
| C3 | Add GraphQL query for tags with story counts | `TagManagement.tsx` |
| C4 | Implement TagList with sorted tags | `TagManagement.tsx` |
| C5 | Implement TagRow with view mode (TagChip + count + Menu) | `TagManagement.tsx` |
| C6 | Implement inline rename with Enter/Escape handling | `TagManagement.tsx` |
| C7 | Integrate ColorPicker for color changes | `TagManagement.tsx` |
| C8 | Implement delete confirmation AlertDialog | `TagManagement.tsx` |
| C9 | Add UpdateTag mutation with optimistic updates | `TagManagement.tsx` |
| C10 | Add DeleteTag mutation | `TagManagement.tsx` |

### Phase D: Routing & Integration

**Goal:** Wire up the page and add navigation

| Step | Task | File(s) |
|------|------|---------|
| D1 | Add `/library/tags` route | Router config |
| D2 | Add "Manage Tags" link in Library page header | `apps/kamp-us/src/pages/Library.tsx` |
| D3 | Fetch schema and compile Relay artifacts | - |
| D4 | Manual testing of full flow | - |

### Phase E: Polish & Verification

| Step | Task |
|------|------|
| E1 | Run `biome check --write .` |
| E2 | Run `pnpm --filter worker exec tsc --noEmit` |
| E3 | Run `pnpm --filter worker run test` |
| E4 | Verify keyboard navigation (Tab, Enter, Escape) |
| E5 | Verify screen reader accessibility |

---

## Progress Tracking

### Phase A: Backend
- [x] A1: Add totalCount to StoryConnection
- [x] A2: Update listStories
- [x] A3: Update storiesByTag
- [x] A4: Update stories resolver
- [x] A5: Update storiesByTag resolver
- [x] A6: Add Tag.stories field
- [x] A7: Tests pass

### Phase B: ColorPicker
- [x] B1: ColorPicker.tsx
- [x] B2: ColorPicker.module.css
- [x] B3: Export component

### Phase C: Tag Management Page
- [x] C1: TagManagement.tsx
- [x] C2: TagManagement.module.css
- [x] C3: GraphQL query
- [x] C4: TagList
- [x] C5: TagRow view mode
- [x] C6: Inline rename
- [x] C7: ColorPicker integration
- [x] C8: Delete dialog
- [x] C9: UpdateTag mutation
- [x] C10: DeleteTag mutation

### Phase D: Routing
- [x] D1: Add route
- [x] D2: Add nav link
- [x] D3: Relay compile
- [ ] D4: Manual test

### Phase E: Polish
- [x] E1: Biome
- [x] E2: Type check
- [x] E3: Tests
- [ ] E4: Keyboard nav
- [ ] E5: Accessibility

---

## Dependencies Between Steps

```
A1 ─► A2 ─► A4 ─┐
              ├─► A7 ─► D3
A1 ─► A3 ─► A5 ─┤
              │
A1 ─► A6 ──────┘

B1 ─► B2 ─► B3 ─► C7

C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C8 ─► C9 ─► C10
                              │
                              └─► C7 (needs B3)

D1 ─► D2 ─► D3 ─► D4 ─► E1 ─► E2 ─► E3 ─► E4 ─► E5
```

## Notes

- Phase A and B can run in parallel
- Phase C depends on A7 (backend ready) and B3 (ColorPicker ready)
- Phase D depends on C10 (page complete)
- Always run Relay compile after schema changes
