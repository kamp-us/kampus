# Relay Pagination - Technical Design

## Overview

Migrate the Library page from manual pagination (using `useLazyLoadQuery` with `fetchKey` state) to proper Relay pagination using `usePaginationFragment`. This enables "Load More" functionality without full page refetches.

## Architecture

### Current vs Target State

```
CURRENT                                TARGET
────────────────────────────────────────────────────────────────
LibraryQuery (root)                    LibraryQuery (root)
  └── me.library.stories(...)            └── me.library
        └── edges/pageInfo                     └── ...LibraryStoriesFragment
                                                     └── stories @connection
                                                           └── edges/pageInfo

useLazyLoadQuery + fetchKey state      useLazyLoadQuery + usePaginationFragment
No "Load More"                         loadNext() / hasNext / isLoadingNext
```

### Component Architecture

```
Library.tsx
├── AuthenticatedLibrary
│   ├── CreateStoryForm (unchanged)
│   ├── AllStoriesView
│   │   ├── useLazyLoadQuery(LibraryQuery)     # Fetches root + fragment
│   │   ├── usePaginationFragment(StoriesFragment)  # NEW
│   │   ├── StoryList
│   │   │   └── StoryRow[] (uses useFragment)
│   │   └── LoadMoreButton                     # NEW
│   └── FilteredLibraryView
│       ├── useLazyLoadQuery(FilteredQuery)
│       ├── usePaginationFragment(FilteredStoriesFragment)  # NEW
│       ├── StoryList
│       └── LoadMoreButton                     # NEW
```

## GraphQL Changes

### Fragment Definitions

**LibraryStoriesFragment** (for unfiltered view):
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
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**LibraryFilteredStoriesFragment** (for tag-filtered view):
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
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Root Queries (Updated)

**LibraryQuery** (includes fragment spread):
```graphql
query LibraryQuery($first: Int, $after: String) {
  me {
    library {
      ...LibraryStoriesFragment @arguments(first: $first, after: $after)
    }
  }
}
```

**LibraryFilteredQuery** (includes fragment spread):
```graphql
query LibraryFilteredQuery($tagName: String!, $first: Int, $after: String) {
  me {
    library {
      ...LibraryFilteredStoriesFragment @arguments(tagName: $tagName, first: $first, after: $after)
    }
  }
}
```

### Key Directive Usage

| Directive | Purpose |
|-----------|---------|
| `@argumentDefinitions` | Declares fragment variables for pagination args |
| `@refetchable` | Generates pagination query for `usePaginationFragment` |
| `@connection(key: "...")` | Enables Relay connection handling, store updates |
| `filters: ["tagName"]` | Separates connections by filter value in store |

## Component Implementation

### AllStoriesView

```typescript
function AllStoriesView({libraryRef, ...}) {
  const {
    data,
    loadNext,
    hasNext,
    isLoadingNext,
  } = usePaginationFragment<
    LibraryStoriesPaginationQuery,
    LibraryStoriesFragment$key
  >(LibraryStoriesFragment, libraryRef);

  const stories = data.stories.edges;

  return (
    <>
      <StoryList stories={stories} ... />
      {hasNext && (
        <LoadMoreButton
          onClick={() => loadNext(DEFAULT_PAGE_SIZE)}
          isLoading={isLoadingNext}
        />
      )}
    </>
  );
}
```

### FilteredLibraryView

```typescript
function FilteredLibraryView({libraryRef, tagName, ...}) {
  const {
    data,
    loadNext,
    hasNext,
    isLoadingNext,
  } = usePaginationFragment<
    LibraryFilteredStoriesPaginationQuery,
    LibraryFilteredStoriesFragment$key
  >(LibraryFilteredStoriesFragment, libraryRef);

  const stories = data.storiesByTag.edges;

  return (
    <>
      <StoryList stories={stories} ... />
      {hasNext && (
        <LoadMoreButton
          onClick={() => loadNext(DEFAULT_PAGE_SIZE)}
          isLoading={isLoadingNext}
        />
      )}
    </>
  );
}
```

### LoadMoreButton Component

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
      <Button
        onClick={onClick}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? "Loading..." : "Load More"}
      </Button>
    </div>
  );
}
```

## Mutation Directives (Declarative Approach)

Using Relay's declarative directives instead of imperative `updater` functions.

### Getting Connection IDs

Connection IDs are obtained from the fragment data's `__id` field:

```typescript
// In component using usePaginationFragment
const {data, ...} = usePaginationFragment(LibraryStoriesFragment, libraryRef);

// The connection ID is available on the connection field
const connectionId = data.stories.__id;
```

### CreateStory - @prependNode

Since `createStory` returns a node (not an edge), use `@prependNode` with `edgeTypeName`:

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
      id
      url
      title
      description
      createdAt
      tags {
        id
        name
        color
      }
    }
  }
}
```

```typescript
// Usage
commitStory({
  variables: {
    url,
    title,
    description,
    tagIds,
    connections: [connectionId],  // Pass connection ID
  },
  onCompleted: ...
});
```

### DeleteStory - @deleteEdge

```graphql
mutation LibraryDeleteStoryMutation(
  $id: String!
  $connections: [ID!]!
) {
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

```typescript
// Usage
commitDelete({
  variables: {
    id: storyId,
    connections: [connectionId],  // Pass connection ID
  },
  onCompleted: ...
});
```

### Passing Connection IDs to Forms

The `CreateStoryForm` and `StoryRow` components need access to the connection ID. Pass it as a prop:

```typescript
// AllStoriesView
<CreateStoryForm
  connectionId={data.stories.__id}
  ...
/>

// StoryRow (for delete)
<StoryRow
  connectionId={data.stories.__id}
  storyRef={node}
  ...
/>
```

## Data Flow

```
1. Initial Load
   ┌─────────────────┐
   │ LibraryQuery    │──────► useLazyLoadQuery
   └────────┬────────┘
            │ me.library ref
            ▼
   ┌─────────────────────────┐
   │ LibraryStoriesFragment  │──────► usePaginationFragment
   └────────┬────────────────┘
            │ {data, loadNext, hasNext, isLoadingNext}
            ▼
   ┌─────────────────┐
   │ Render stories  │
   │ + Load More btn │
   └─────────────────┘

2. Load More
   ┌─────────────────┐
   │ loadNext(20)    │
   └────────┬────────┘
            │ Relay generates LibraryStoriesPaginationQuery
            ▼
   ┌─────────────────────────────┐
   │ Fetch next page             │
   │ (uses after: endCursor)     │
   └────────┬────────────────────┘
            │ New edges appended to store
            ▼
   ┌─────────────────┐
   │ Re-render with  │
   │ all stories     │
   └─────────────────┘
```

## File Changes

| File | Change |
|------|--------|
| `Library.tsx` | Replace `useLazyLoadQuery` patterns with `usePaginationFragment` |
| `Library.tsx` | Add `LoadMoreButton` component |
| `Library.tsx` | Update mutations to use `@prependNode` / `@deleteEdge` directives |
| `Library.tsx` | Pass `connectionId` prop to `CreateStoryForm` and `StoryRow` |
| `Library.tsx` | Remove imperative `updater` functions from mutations |
| `Library.module.css` | Add `.loadMoreContainer` styles |

## Type Generation

After updating GraphQL, run:
```bash
pnpm --filter kamp-us run relay
```

This generates:
- `LibraryStoriesFragment.graphql.ts`
- `LibraryStoriesPaginationQuery.graphql.ts`
- `LibraryFilteredStoriesFragment.graphql.ts`
- `LibraryFilteredStoriesPaginationQuery.graphql.ts`

## Edge Cases

### Empty State
- `hasNext` is false when connection is empty
- LoadMoreButton not shown

### Filter Switching
- Each `tagName` filter has separate connection in store (due to `filters: ["tagName"]`)
- Switching tags loads fresh data, doesn't carry over pagination state

### Mutation with Multiple Connections
- CreateStory only prepends to `Library_stories` (unfiltered)
- If user is viewing filtered, new story may not appear until filter cleared
- Alternative: Also insert into filtered connection if tags match (future enhancement)

## Testing Checklist

- [ ] Initial load shows first 20 stories
- [ ] "Load More" appears when > 20 stories exist
- [ ] Clicking "Load More" appends next page
- [ ] Button shows loading state during fetch
- [ ] Button disappears when all loaded
- [ ] Works with tag filtering
- [ ] New story appears at top after creation
- [ ] Deleted story removed from list
- [ ] No console errors or Relay warnings
