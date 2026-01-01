# Relay Pagination - Implementation Plan

## Overview

Implement `usePaginationFragment` for the Library page with "Load More" functionality and declarative mutation directives.

## Task Breakdown

### Phase A: GraphQL Fragment Changes

- [ ] **A1**: Define `LibraryStoriesFragment` with `@connection` and `@refetchable`
- [ ] **A2**: Define `LibraryFilteredStoriesFragment` with `@connection`, `@refetchable`, and `filters`
- [ ] **A3**: Update `LibraryQuery` to spread `LibraryStoriesFragment`
- [ ] **A4**: Update `LibraryFilteredQuery` to spread `LibraryFilteredStoriesFragment`
- [ ] **A5**: Update `CreateStoryMutation` with `$connections` param and `@prependNode`
- [ ] **A6**: Update `DeleteStoryMutation` with `$connections` param and `@deleteEdge`
- [ ] **A7**: Run `pnpm --filter kamp-us run relay` to generate types

### Phase B: Component Refactoring

- [ ] **B1**: Create `LoadMoreButton` component with loading state
- [ ] **B2**: Refactor `AllStoriesView` to use `usePaginationFragment`
- [ ] **B3**: Refactor `FilteredLibraryView` to use `usePaginationFragment`
- [ ] **B4**: Update `CreateStoryForm` to accept and use `connectionId` prop
- [ ] **B5**: Update `StoryRow` to accept and use `connectionId` prop for delete
- [ ] **B6**: Remove `fetchKey` state and manual refetch logic

### Phase C: Styling & Polish

- [ ] **C1**: Add `.loadMoreContainer` styles to `Library.module.css`
- [ ] **C2**: Verify button disabled/loading states

### Phase D: Verification

- [ ] **D1**: Run `pnpm --filter kamp-us run relay` (no errors)
- [ ] **D2**: Run `biome check --write apps/kamp-us/src/pages/Library.tsx`
- [ ] **D3**: Manual test: pagination with default page size
- [ ] **D4**: Manual test: pagination with small page size (change constant)
- [ ] **D5**: Manual test: create story prepends to list
- [ ] **D6**: Manual test: delete story removes from list
- [ ] **D7**: Manual test: tag filtering with pagination

## Implementation Order

```
A1 → A2 → A3 → A4 → A5 → A6 → A7
                                ↓
B1 → B2 → B3 → B4 → B5 → B6 ←──┘
                                ↓
                    C1 → C2 → D1-D7
```

## Detailed Steps

### A1: LibraryStoriesFragment

Location: `Library.tsx`, after `StoryFragment`

```graphql
fragment LibraryStoriesFragment on Library
  @argumentDefinitions(
    first: {type: "Int", defaultValue: 20}
    after: {type: "String"}
  )
  @refetchable(queryName: "LibraryStoriesPaginationQuery") {
  stories(first: $first, after: $after)
    @connection(key: "Library_stories") {
    edges {
      node {
        ...LibraryStoryFragment
      }
    }
  }
}
```

### A2: LibraryFilteredStoriesFragment

Location: `Library.tsx`, after `LibraryStoriesFragment`

```graphql
fragment LibraryFilteredStoriesFragment on Library
  @argumentDefinitions(
    tagName: {type: "String!"}
    first: {type: "Int", defaultValue: 20}
    after: {type: "String"}
  )
  @refetchable(queryName: "LibraryFilteredStoriesPaginationQuery") {
  storiesByTag(tagName: $tagName, first: $first, after: $after)
    @connection(key: "Library_storiesByTag", filters: ["tagName"]) {
    edges {
      node {
        ...LibraryStoryFragment
      }
    }
  }
}
```

### A3-A4: Update Root Queries

Simplify to just spread the fragments:

```graphql
query LibraryQuery {
  me {
    library {
      ...LibraryStoriesFragment
    }
  }
}

query LibraryFilteredQuery($tagName: String!) {
  me {
    library {
      ...LibraryFilteredStoriesFragment @arguments(tagName: $tagName)
    }
  }
}
```

### A5: CreateStoryMutation with @prependNode

```graphql
mutation LibraryCreateStoryMutation(
  $url: String!
  $title: String!
  $description: String
  $tagIds: [String!]
  $connections: [ID!]!
) {
  createStory(url: $url, title: $title, description: $description, tagIds: $tagIds) {
    story @prependNode(connections: $connections, edgeTypeName: "StoryEdge") {
      ...LibraryStoryFragment
    }
  }
}
```

### A6: DeleteStoryMutation with @deleteEdge

```graphql
mutation LibraryDeleteStoryMutation($id: String!, $connections: [ID!]!) {
  deleteStory(id: $id) {
    success
    deletedStoryId @deleteEdge(connections: $connections)
    error {
      code
      message
    }
  }
}
```

### B1: LoadMoreButton

```typescript
function LoadMoreButton({
  onClick,
  isLoading,
}: {
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <div className={styles.loadMoreContainer}>
      <Button onClick={onClick} disabled={isLoading}>
        {isLoading ? "Loading..." : "Load More"}
      </Button>
    </div>
  );
}
```

### B2-B3: View Components with usePaginationFragment

Key changes:
- Accept `libraryRef` instead of fetching directly
- Use `usePaginationFragment` to get `{data, loadNext, hasNext, isLoadingNext}`
- Render `LoadMoreButton` when `hasNext` is true
- Pass `connectionId` to child components

### B4-B5: Mutation Components

- Add `connectionId: string` prop
- Pass `connections: [connectionId]` in mutation variables
- Remove `updater` function

### C1: CSS Styles

```css
.loadMoreContainer {
  display: flex;
  justify-content: center;
  padding: var(--spacing-4) 0;
}
```

## Files Modified

| File | Type |
|------|------|
| `apps/kamp-us/src/pages/Library.tsx` | Major refactor |
| `apps/kamp-us/src/pages/Library.module.css` | Minor addition |

## Rollback Plan

If issues arise:
1. Revert `Library.tsx` to previous version
2. Run `pnpm --filter kamp-us run relay` to regenerate old types
3. Delete new `__generated__` files if any remain

## Success Criteria

- [ ] "Load More" button appears when more stories exist
- [ ] Clicking loads next page, appends to list
- [ ] Button hidden when all loaded
- [ ] New stories appear at top after creation
- [ ] Deleted stories removed from list
- [ ] Tag filtering works with pagination
- [ ] No Relay/console errors
- [ ] Lint passes
