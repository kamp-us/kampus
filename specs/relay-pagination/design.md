# Relay Pagination - Technical Design

**Status: COMPLETED**

## Overview

Migrate the Library page from manual pagination (using `useLazyLoadQuery` with `fetchKey` state) to proper Relay pagination using `usePaginationFragment`. This enables "Load More" functionality without full page refetches.

## Architecture

### Current vs Target State

```
CURRENT                                TARGET (IMPLEMENTED)
────────────────────────────────────────────────────────────────
LibraryQuery (root)                    LibraryQuery (root)
  └── me.library.stories(...)            └── me.library
        └── edges/pageInfo                     └── ...LibraryStoriesFragment
                                                     └── stories @connection
                                                           └── __id, totalCount
                                                           └── edges/pageInfo

useLazyLoadQuery + fetchKey state      useLazyLoadQuery + usePaginationFragment
No "Load More"                         loadNext() / hasNext / isLoadingNext
```

### Component Architecture

```
Library.tsx
├── AuthenticatedLibrary
│   ├── CreateStoryForm (connectionId from callback)
│   ├── Suspense
│   │   ├── AllStoriesView
│   │   │   ├── useLazyLoadQuery(LibraryQuery)
│   │   │   ├── usePaginationFragment(StoriesFragment)
│   │   │   ├── onConnectionId callback (reports __id to parent)
│   │   │   ├── StoryList
│   │   │   │   └── StoryRow[] (uses useRefetchableFragment)
│   │   │   └── LoadMoreButton
│   │   └── FilteredLibraryView
│   │       ├── useLazyLoadQuery(FilteredQuery)
│   │       ├── usePaginationFragment(FilteredStoriesFragment)
│   │       ├── onConnectionId callback
│   │       ├── StoryList
│   │       └── LoadMoreButton
```

## Backend Requirements

### Library Must Implement Node Interface

For `@refetchable` to work, the parent type must implement the Node interface:

```typescript
// relay.ts
export const NodeType = {
  Story: "Story",
  Tag: "Tag",
  Library: "Library",  // Added
} as const;

// index.ts
const Library = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Library")),
  id: Schema.String.annotations({identifier: "ulid"}),
}).annotations({
  title: "Library",
  [asObjectType]: {interfaces: [NodeInterface]},
});
```

### Pagination Input Types

Relay sends `undefined` for optional params, not `null`. Use `NullishOr` and `Int`:

```typescript
stories: field(standard(StoryConnection))
  .input({
    first: standard(Schema.NullishOr(Schema.Int)),  // Not NullOr, not Number
    after: standard(Schema.NullishOr(Schema.String)),
  })
```

### DeleteStory Must Return ID Type

For `@deleteEdge` directive, the ID field must have the ID annotation:

```typescript
const DeleteStoryPayload = Schema.Struct({
  success: Schema.Boolean,
  deletedStoryId: Schema.NullOr(Schema.String.annotations({identifier: "ulid"})),
  error: Schema.NullOr(StoryNotFoundError),
});
```

## GraphQL Fragments (Implemented)

### LibraryStoriesFragment

```graphql
fragment LibraryStoriesFragment on Library
  @argumentDefinitions(
    first: {type: "Int", defaultValue: 20}
    after: {type: "String"}
  )
  @refetchable(queryName: "LibraryStoriesPaginationQuery") {
  stories(first: $first, after: $after)
    @connection(key: "Library_stories") {
    __id           # Connection ID for mutations
    totalCount     # Total count for display
    edges {
      node {
        id
        ...LibraryStoryFragment
      }
    }
  }
}
```

### LibraryFilteredStoriesFragment

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
    __id
    totalCount
    edges {
      node {
        ...LibraryStoryFragment
      }
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

## Mutation Directives

### CreateStory with @prependNode

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

### DeleteStory with @deleteEdge

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

### Updater Functions for totalCount

Declarative directives only handle edges, not scalar fields. Use `updater` for `totalCount`.

**Helper utility** (`apps/kamp-us/src/relay/updateConnectionCount.ts`):

```typescript
import type {RecordSourceSelectorProxy} from "relay-runtime";

export function updateConnectionCount(
  store: RecordSourceSelectorProxy,
  connectionId: string,
  delta: number,
) {
  const connection = store.get(connectionId);
  if (connection) {
    const currentCount = connection.getValue("totalCount");
    if (typeof currentCount === "number") {
      connection.setValue(currentCount + delta, "totalCount");
    }
  }
}
```

**Usage in mutations:**

```typescript
commitStory({
  variables: { url, title, description, tagIds, connections: [connectionId] },
  updater: (store) => {
    updateConnectionCount(store, connectionId, 1);
  },
  onCompleted: ...
});

commitDelete({
  variables: { id: story.id, connections: [connectionId] },
  updater: (store) => {
    updateConnectionCount(store, connectionId, -1);
  },
  onCompleted: ...
});
```

## Connection ID Pattern

### Why onConnectionId Callback?

The `CreateStoryForm` lives outside the Suspense boundary (in `AuthenticatedLibrary`) so its state persists when switching between "all stories" and tag-filtered views. However, the connection ID (`__id`) is only available inside the Suspense boundary after data loads.

Solution: Child views report connection ID to parent via callback:

```typescript
function AuthenticatedLibrary() {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const handleConnectionId = useCallback((id: string) => setConnectionId(id), []);

  return (
    <>
      <CreateStoryForm connectionId={connectionId} ... />
      <Suspense>
        <AllStoriesView onConnectionId={handleConnectionId} ... />
      </Suspense>
    </>
  );
}

function AllStoriesView({ onConnectionId, ... }) {
  const { data } = usePaginationFragment(...);
  const connectionId = data.stories.__id;

  useEffect(() => {
    onConnectionId(connectionId);
  }, [connectionId, onConnectionId]);

  return ...;
}
```

### Alternative Considered: Form Inside Views

Moving `CreateStoryForm` inside each view component would give direct access to `connectionId`, but causes UX regression - form state resets when switching views.

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
            │ connectionId = data.stories.__id
            ▼
   ┌─────────────────┐
   │ onConnectionId  │──────► Parent receives connectionId
   │ callback        │
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

3. Create Story
   ┌─────────────────┐
   │ commitStory()   │
   └────────┬────────┘
            │ @prependNode adds to connection
            │ updater increments totalCount
            ▼
   ┌─────────────────┐
   │ Story appears   │
   │ at top of list  │
   └─────────────────┘
```

## File Changes Summary

| File | Change |
|------|--------|
| `apps/worker/src/graphql/relay.ts` | Add Library to NodeType |
| `apps/worker/src/index.ts` | Library implements Node, pagination type fixes, deletedStoryId ID annotation |
| `apps/kamp-us/src/pages/Library.tsx` | usePaginationFragment, LoadMoreButton, onConnectionId callback, updater functions |
| `apps/kamp-us/src/pages/Library.module.css` | Add `.loadMoreContainer` styles |
| `apps/kamp-us/src/relay/updateConnectionCount.ts` | Helper function for updating totalCount in mutations |

## Generated Files

After running `pnpm --filter kamp-us run relay`:
- `LibraryStoriesFragment.graphql.ts`
- `LibraryStoriesPaginationQuery.graphql.ts`
- `LibraryFilteredStoriesFragment.graphql.ts`
- `LibraryFilteredStoriesPaginationQuery.graphql.ts`

## Edge Cases Handled

### Empty State
- `hasNext` is false when connection is empty
- LoadMoreButton not shown

### Filter Switching
- Each `tagName` filter has separate connection in store (due to `filters: ["tagName"]`)
- Switching tags loads fresh data, doesn't carry over pagination state
- Form state persists due to being outside Suspense

### Connection ID Not Yet Available
- Form renders with `connectionId: null` initially
- Shows error "Cannot save - please wait for page to load" if submitted before data loads
- In practice, data loads quickly so this is rare
