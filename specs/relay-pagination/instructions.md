# Relay Pagination

## Feature Overview

Implement proper Relay pagination using `usePaginationFragment` to enable "Load More" functionality in the Library page. Currently, the app fetches a fixed number of stories (20) with no way to load additional items.

## Problem Statement

The Library page currently:
- Uses `useLazyLoadQuery` with a fixed `first: 20` limit
- Has connection pattern in GraphQL (edges, pageInfo, cursor) but doesn't use it for pagination
- Uses manual `fetchKey` state for refetching instead of Relay's built-in pagination
- Cannot load more than 20 stories even if the user has hundreds saved

## User Stories

### US-1: Load More Stories
**As a** library user with many saved stories
**I want to** load additional stories beyond the initial page
**So that** I can access my entire collection without being limited to 20 items

**Acceptance Criteria:**
- [ ] "Load More" button appears when `hasNextPage` is true
- [ ] Clicking "Load More" fetches the next page of stories
- [ ] New stories are appended to the existing list
- [ ] Button shows loading state while fetching
- [ ] Button disappears when all stories are loaded

### US-2: Filtered Pagination
**As a** user filtering stories by tag
**I want to** paginate through filtered results
**So that** I can see all stories with a specific tag

**Acceptance Criteria:**
- [ ] Pagination works with tag filtering (`storiesByTag` query)
- [ ] "Load More" respects the current filter
- [ ] Switching filters resets pagination to first page

## Technical Context

### Current Implementation (Library.tsx)

```typescript
// Current: useLazyLoadQuery with fixed limit, manual refetch
const data = useLazyLoadQuery<LibraryQueryType>(
  LibraryQuery,
  {first: DEFAULT_PAGE_SIZE},
  {fetchKey, fetchPolicy: ...},
);
```

### Target Implementation

```typescript
// Target: usePaginationFragment with @connection directive
const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment(
  LibraryConnectionFragment,
  queryRef,
);
```

### GraphQL Changes Required

The current query structure:
```graphql
query LibraryQuery($first: Float!, $after: String) {
  me {
    library {
      stories(first: $first, after: $after) {
        edges { ... }
        pageInfo { hasNextPage, endCursor }
      }
    }
  }
}
```

Needs to become a `@refetchable` fragment with `@connection`:
```graphql
fragment LibraryStoriesFragment on Library
  @refetchable(queryName: "LibraryStoriesPaginationQuery")
  @argumentDefinitions(
    first: {type: "Int", defaultValue: 20}
    after: {type: "String"}
  ) {
  stories(first: $first, after: $after) @connection(key: "Library_stories") {
    edges {
      node { ...StoryFragment }
    }
  }
}
```

## Constraints

- Must maintain existing functionality (create/update/delete stories)
- Must work with both unfiltered and tag-filtered views
- Should use proper Relay patterns, not workarounds
- Must handle optimistic updates for mutations correctly with connections

## Dependencies

- GraphQL schema already supports connection pattern
- `@refetchable` directive already used for `StoryFragment`
- Backend returns proper `pageInfo` with `hasNextPage` and `endCursor`

## Out of Scope

- Infinite scroll (just "Load More" button for now)
- Virtual list / windowing for performance
- Server-side cursor changes or backend modifications
- Other Relay improvements (preloaded queries, subscriptions, etc.)
