# Relay Pagination - Implementation Plan

**Status: COMPLETED**

## Overview

Implement `usePaginationFragment` for the Library page with "Load More" functionality and declarative mutation directives.

## Task Breakdown

### Phase A: Backend Changes

- [x] **A1**: Add `Library` to `NodeType` enum in `relay.ts`
- [x] **A2**: Make `Library` type implement Node interface with global ID
- [x] **A3**: Add `Library` case to `nodeResolver`
- [x] **A4**: Update `userResolver` to return Library with encoded global ID
- [x] **A5**: Change pagination inputs from `NullOr` to `NullishOr` (accepts undefined)
- [x] **A6**: Change pagination `first` param from `Float` to `Int`
- [x] **A7**: Add ID annotation to `deletedStoryId` for `@deleteEdge` directive

### Phase B: GraphQL Fragment Changes

- [x] **B1**: Define `LibraryStoriesFragment` with `@connection`, `@refetchable`, `__id`, `totalCount`
- [x] **B2**: Define `LibraryFilteredStoriesFragment` with `@connection`, `@refetchable`, `filters`, `__id`, `totalCount`
- [x] **B3**: Update `LibraryQuery` to spread `LibraryStoriesFragment`
- [x] **B4**: Update `LibraryFilteredQuery` to spread `LibraryFilteredStoriesFragment`
- [x] **B5**: Update `CreateStoryMutation` with `$connections` param and `@prependNode`
- [x] **B6**: Update `DeleteStoryMutation` with `$connections` param and `@deleteEdge`
- [x] **B7**: Run `pnpm --filter kamp-us run relay` to generate types

### Phase C: Component Refactoring

- [x] **C1**: Create `LoadMoreButton` component with loading state
- [x] **C2**: Refactor `AllStoriesView` to use `usePaginationFragment`
- [x] **C3**: Refactor `FilteredLibraryView` to use `usePaginationFragment`
- [x] **C4**: Add `onConnectionId` callback to pass connection ID from views to parent
- [x] **C5**: Update `CreateStoryForm` to accept `connectionId` prop (nullable)
- [x] **C6**: Update `StoryRow` to accept `connectionId` prop for delete
- [x] **C7**: Add `updater` functions to mutations to update `totalCount`

### Phase D: Styling & Polish

- [x] **D1**: Add `.loadMoreContainer` styles to `Library.module.css`
- [x] **D2**: Verify button disabled/loading states

### Phase E: Verification

- [x] **E1**: Run `pnpm --filter kamp-us run relay` (no errors)
- [x] **E2**: Run `biome check --write apps/kamp-us/src/pages/Library.tsx`
- [x] **E3**: Manual test: pagination with default page size (20)
- [x] **E4**: Manual test: pagination with small page size (5) - verified Load More appears
- [x] **E5**: Manual test: create story prepends to list, totalCount updates
- [x] **E6**: Manual test: delete story removes from list, totalCount updates
- [x] **E7**: Manual test: tag filtering with pagination

## Implementation Notes

### Key Discoveries During Implementation

1. **Library must implement Node interface** - Required for `@refetchable` directive to work. Added Library to NodeType and made it implement Node with global ID.

2. **NullishOr vs NullOr** - Relay sends `undefined` for optional pagination params, but Effect Schema's `NullOr` only accepts `null`. Changed to `NullishOr`.

3. **Float vs Int** - Effect Schema's `Schema.Number` maps to GraphQL `Float`, but Relay expects `Int` for pagination. Changed to `Schema.Int`.

4. **Connection ID via `__id`** - Query for `__id` field on connections to get the connection ID for declarative directives.

5. **totalCount requires updater** - Declarative directives (`@prependNode`, `@deleteEdge`) only handle edges, not scalar fields. Added `updater` functions to increment/decrement `totalCount`.

6. **onConnectionId callback pattern** - Form is outside Suspense boundary for UX (persists across view switches), so connection ID must be passed up from child views via callback.

### Files Modified

| File | Change |
|------|--------|
| `apps/worker/src/graphql/relay.ts` | Add Library to NodeType |
| `apps/worker/src/index.ts` | Library implements Node, pagination type fixes |
| `apps/kamp-us/src/pages/Library.tsx` | Major refactor with usePaginationFragment |
| `apps/kamp-us/src/pages/Library.module.css` | Add loadMoreContainer styles |

## Success Criteria - ALL MET

- [x] "Load More" button appears when more stories exist
- [x] Clicking loads next page, appends to list
- [x] Button hidden when all loaded
- [x] New stories appear at top after creation
- [x] Deleted stories removed from list
- [x] totalCount updates correctly on create/delete
- [x] Tag filtering works with pagination
- [x] No Relay/console errors
- [x] Lint passes
