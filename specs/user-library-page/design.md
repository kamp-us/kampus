# User Library Page - Technical Design

Derived from [requirements.md](./requirements.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (apps/kamp-us)                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  /me/library route                                       │    │
│  │  └── Library.tsx                                         │    │
│  │      ├── StoryList (Relay fragment)                      │    │
│  │      ├── StoryRow (display + edit + delete states)       │    │
│  │      ├── CreateStoryForm (collapsed/expanded)            │    │
│  │      └── EmptyState                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │ GraphQL                             │
│                           ▼                                     │
├─────────────────────────────────────────────────────────────────┤
│  Backend (apps/worker)                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  GraphQL Resolvers (GQLoom + Effect)                     │    │
│  │  ├── User.library → Library resolver                     │    │
│  │  ├── Library.stories → paginated stories                 │    │
│  │  ├── Mutation.createStory                                │    │
│  │  ├── Mutation.updateStory                                │    │
│  │  └── Mutation.deleteStory                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │ RPC                                 │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Library Durable Object (per-user)                       │    │
│  │  ├── listStories(first, after)                           │    │
│  │  ├── getStory(id)                                        │    │
│  │  ├── createStory(url, title) [exists]                    │    │
│  │  ├── updateStory(id, title)                              │    │
│  │  └── deleteStory(id)                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │ SQL                                 │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SQLite (Drizzle ORM)                                    │    │
│  │  └── story table                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend Design

### 1. Library DO Methods

**File:** `apps/worker/src/features/library/Library.ts`

#### listStories

```typescript
async listStories(options?: {first?: number; after?: string}) {
  const limit = options?.first ?? 20;

  let query = this.db
    .select()
    .from(schema.story)
    .orderBy(desc(schema.story.id));  // ULIDx IDs are time-sortable

  if (options?.after) {
    // Cursor is the story ID (ULIDx - time-sortable)
    query = query.where(lt(schema.story.id, options.after));
  }

  const dbStories = await query.limit(limit + 1).all();
  const hasNextPage = dbStories.length > limit;
  const edges = dbStories.slice(0, limit);

  // Convert Date objects to ISO strings for RPC serialization
  return {
    edges: edges.map(s => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    hasNextPage,
    endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
  };
}
```

**Cursor strategy:** Use `id` directly as cursor. IDs from `@usirin/forge` are ULIDx (time-sortable), so `ORDER BY id DESC` = chronological order. Simpler than timestamp-based cursors.

#### getStory

```typescript
async getStory(id: string) {
  const story = await this.db
    .select()
    .from(schema.story)
    .where(eq(schema.story.id, id))
    .get();

  if (!story) return null;

  // Convert Date to ISO string for RPC
  return {
    ...story,
    createdAt: story.createdAt.toISOString(),
  };
}
```

#### updateStory

```typescript
async updateStory(id: string, updates: {title?: string}) {
  const existing = await this.getStory(id);
  if (!existing) return null;

  if (!updates.title) return existing;  // Nothing to update (already has ISO date)

  const [story] = await this.db
    .update(schema.story)
    .set({title: updates.title})
    .where(eq(schema.story.id, id))
    .returning();

  // Convert Date to ISO string for RPC
  return {
    ...story,
    createdAt: story.createdAt.toISOString(),
  };
}
```

#### deleteStory

```typescript
async deleteStory(id: string) {
  // Delete tag associations first (cascade)
  await this.db.delete(schema.storyTag).where(eq(schema.storyTag.storyId, id));
  // Then delete story
  await this.db.delete(schema.story).where(eq(schema.story.id, id));
}
```

---

### 2. Domain Schema Types (Feature Layer)

**File:** `apps/worker/src/features/library/schema.ts`

These are domain types used by the Durable Object - no GraphQL annotations needed.

```typescript
import {Schema} from "effect";

// Domain type - used by Library DO methods
// Note: DO RPC serializes data, so dates are strings (ISO format)
export const Story = Schema.Struct({
  id: Schema.String,
  url: Schema.NullOr(Schema.String),
  normalizedUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  createdAt: Schema.String,  // ISO string (RPC serializes dates)
});
export type Story = Schema.Schema.Type<typeof Story>;
```

**Note:** DO RPC methods serialize return values, so `Date` objects become strings. The DO methods should convert dates to ISO strings before returning.

---

### 3. GraphQL Schema (API Layer)

**File:** `apps/worker/src/index.ts` (or could be extracted to `apps/worker/src/graphql/library.ts`)

These are GraphQL-specific types with annotations for GQLoom. They transform domain types for the API layer.

Following GQLoom's `resolver.of()` pattern for type-scoped resolvers.

#### GraphQL Types (with annotations)

```typescript
import {Schema} from "effect";
import {resolver, query, field, mutation} from "@gqloom/core";

// Story type
const Story = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
}).annotations({title: "Story"});

// Story edge for connections
const StoryEdge = Schema.Struct({
  node: Story,
  cursor: Schema.String,
}).annotations({title: "StoryEdge"});

// Page info
const PageInfo = Schema.Struct({
  hasNextPage: Schema.Boolean,
  hasPreviousPage: Schema.Boolean,
  startCursor: Schema.NullOr(Schema.String),
  endCursor: Schema.NullOr(Schema.String),
}).annotations({title: "PageInfo"});

// Story connection
const StoryConnection = Schema.Struct({
  edges: Schema.Array(StoryEdge),
  pageInfo: PageInfo,
}).annotations({title: "StoryConnection"});

// Library type (container for library fields)
const Library = Schema.Struct({}).annotations({title: "Library"});

// --- Mutation Payloads ---

// Error types for mutations
const StoryNotFoundError = Schema.Struct({
  code: Schema.Literal("STORY_NOT_FOUND"),
  message: Schema.String,
  storyId: Schema.String,
}).annotations({title: "StoryNotFoundError"});

// Create story payload
const CreateStoryPayload = Schema.Struct({
  story: Story,
}).annotations({title: "CreateStoryPayload"});

// Update story payload (with error handling)
const UpdateStoryPayload = Schema.Struct({
  story: Schema.NullOr(Story),
  error: Schema.NullOr(StoryNotFoundError),
}).annotations({title: "UpdateStoryPayload"});

// Delete story payload (with error handling)
const DeleteStoryPayload = Schema.Struct({
  success: Schema.Boolean,
  deletedStoryId: Schema.NullOr(Schema.String),
  error: Schema.NullOr(StoryNotFoundError),
}).annotations({title: "DeleteStoryPayload"});
```

#### Library Resolver

```typescript
// Resolver for Library type - contains library-specific fields
const libraryResolver = resolver.of(Library, {
  // Field: stories with pagination
  stories: field(standard(StoryConnection))
    .input({
      first: standard(Schema.optional(Schema.Number)),
      after: standard(Schema.optional(Schema.String)),
    })
    .resolve(async ({first, after}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);
      const result = await lib.listStories({first: first ?? 20, after});

      // DO methods already return ISO strings for dates
      return {
        edges: result.edges.map(story => ({
          node: {
            id: story.id,
            url: story.url ?? "",
            title: story.title,
            createdAt: story.createdAt,  // Already ISO string from DO
          },
          cursor: story.id,
        })),
        pageInfo: {
          hasNextPage: result.hasNextPage,
          hasPreviousPage: false,
          startCursor: result.edges[0]?.id ?? null,
          endCursor: result.endCursor,
        },
      };
    }),
});
```

#### User Resolver Extension

```typescript
// Extend User resolver to add library field
const userResolver = resolver.of(User, {
  // Field: library - returns the user's library
  library: field(standard(Library)).resolve(() => {
    // Return empty object - libraryResolver handles the actual fields
    return {};
  }),
});
```

#### Story Mutations

```typescript
// Story mutations - returning Payload types for Relay compatibility
const storyResolver = resolver.of(Story, {
  // Mutation: create a new story
  createStory: mutation(standard(CreateStoryPayload))
    .input({
      url: standard(Schema.String),
      title: standard(Schema.String),
    })
    .resolve(async ({url, title}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);
      const story = await lib.createStory({url, title});

      // DO methods already return ISO strings for dates
      return {
        story: {
          id: story.id,
          url: story.url ?? "",
          title: story.title,
          createdAt: story.createdAt,
        },
      };
    }),

  // Mutation: update story title
  updateStory: mutation(standard(UpdateStoryPayload))
    .input({
      id: standard(Schema.String),
      title: standard(Schema.optional(Schema.String)),
    })
    .resolve(async ({id, title}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);
      const story = await lib.updateStory(id, {title});

      // Return error if story not found
      if (!story) {
        return {
          story: null,
          error: {
            code: "STORY_NOT_FOUND" as const,
            message: `Story with id "${id}" not found`,
            storyId: id,
          },
        };
      }

      return {
        story: {
          id: story.id,
          url: story.url ?? "",
          title: story.title,
          createdAt: story.createdAt,  // Already ISO string from DO
        },
        error: null,
      };
    }),

  // Mutation: delete story
  deleteStory: mutation(standard(DeleteStoryPayload))
    .input({
      id: standard(Schema.String),
    })
    .resolve(async ({id}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      // Check if story exists first
      const existing = await lib.getStory(id);
      if (!existing) {
        return {
          success: false,
          deletedStoryId: null,
          error: {
            code: "STORY_NOT_FOUND" as const,
            message: `Story with id "${id}" not found`,
            storyId: id,
          },
        };
      }

      await lib.deleteStory(id);

      return {
        success: true,
        deletedStoryId: id,
        error: null,
      };
    }),
});
```

#### Weaving Schema

```typescript
// Weave all resolvers together
const schema = weave(
  EffectWeaver,
  asyncContextProvider,
  // existing resolvers...
  userResolver,
  libraryResolver,
  storyResolver,
);
```

---

## Frontend Design

### 1. Component Structure

```
apps/kamp-us/src/
├── pages/
│   ├── Library.tsx          # Main page component
│   └── Library.module.css   # Page styles
└── components/
    └── library/
        ├── StoryList.tsx        # Handles pagination fragment
        ├── StoryRow.tsx         # Single story display/edit/delete
        ├── CreateStoryForm.tsx  # Collapsed/expanded form
        └── EmptyState.tsx       # Empty library state
```

### 2. Page Component

**File:** `apps/kamp-us/src/pages/Library.tsx`

```typescript
import {Suspense} from "react";
import {graphql, useLazyLoadQuery} from "react-relay";
import {Navigate} from "react-router";
import {StoryList} from "../components/library/StoryList";
import {CreateStoryForm} from "../components/library/CreateStoryForm";
import {EmptyState} from "../components/library/EmptyState";
import styles from "./Library.module.css";

const LibraryQuery = graphql`
  query LibraryQuery($first: Int!, $after: String) {
    me {
      library {
        stories(first: $first, after: $after) {
          edges {
            node {
              id
            }
          }
          ...StoryList_stories
        }
      }
    }
  }
`;

function LibraryContent() {
  const data = useLazyLoadQuery(LibraryQuery, {first: 20});

  // Not authenticated
  if (!data.me) {
    return <Navigate to="/login" replace />;
  }

  const hasStories = data.me.library.stories.edges.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Library</h1>
      </header>

      <CreateStoryForm />

      {hasStories ? (
        <StoryList stories={data.me.library.stories} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

export function Library() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryContent />
    </Suspense>
  );
}
```

### 3. StoryList with Pagination

**File:** `apps/kamp-us/src/components/library/StoryList.tsx`

```typescript
import {graphql, usePaginationFragment} from "react-relay";
import {StoryRow} from "./StoryRow";
import {Button} from "../../design/Button";

const StoryListFragment = graphql`
  fragment StoryList_stories on StoryConnection
  @refetchable(queryName: "StoryListPaginationQuery") {
    edges {
      node {
        id
        ...StoryRow_story
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

export function StoryList({stories}) {
  const {data, loadNext, hasNext, isLoadingNext} = usePaginationFragment(
    StoryListFragment,
    stories
  );

  return (
    <div>
      {data.edges.map(({node}) => (
        <StoryRow key={node.id} story={node} />
      ))}

      {hasNext && (
        <Button
          onClick={() => loadNext(20)}
          disabled={isLoadingNext}
        >
          {isLoadingNext ? "Loading..." : "Load more stories"}
        </Button>
      )}
    </div>
  );
}
```

### 4. StoryRow States

**File:** `apps/kamp-us/src/components/library/StoryRow.tsx`

```typescript
import {useState} from "react";
import {graphql, useFragment, useMutation} from "react-relay";
import styles from "./StoryRow.module.css";

type RowState = "display" | "editing" | "confirmDelete";

const StoryRowFragment = graphql`
  fragment StoryRow_story on Story {
    id
    url
    title
    createdAt
  }
`;

export function StoryRow({story: storyRef}) {
  const story = useFragment(StoryRowFragment, storyRef);
  const [state, setState] = useState<RowState>("display");
  const [editTitle, setEditTitle] = useState(story.title);

  // Mutations with payload error handling
  const [commitUpdate, isUpdating] = useMutation(UpdateStoryMutation);
  const [commitDelete, isDeleting] = useMutation(DeleteStoryMutation);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const domain = new URL(story.url).hostname.replace("www.", "");
  const relativeDate = formatRelativeDate(story.createdAt);

  if (state === "editing") {
    return (
      <div className={styles.row}>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setState("display")}
        />
        <div className={styles.meta}>{domain}</div>
        <div className={styles.actions}>
          <Button onClick={() => setState("display")}>Cancel</Button>
          <Button
            onClick={() => {
              setMutationError(null);
              commitUpdate({
                variables: {id: story.id, title: editTitle},
                onCompleted: (response) => {
                  // Check for error in payload
                  if (response.updateStory.error) {
                    setMutationError(response.updateStory.error.message);
                    return;
                  }
                  setState("display");
                },
              });
            }}
            disabled={isUpdating}
          >
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  if (state === "confirmDelete") {
    return (
      <div className={styles.row}>
        <span>Delete "{story.title}"?</span>
        <div className={styles.actions}>
          <Button onClick={() => setState("display")}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              setMutationError(null);
              commitDelete({
                variables: {id: story.id},
                onCompleted: (response) => {
                  // Check for error in payload
                  if (response.deleteStory.error) {
                    setMutationError(response.deleteStory.error.message);
                    setState("display");
                    return;
                  }
                  // Success - row will be removed by Relay store update
                },
              });
            }}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  // Display state
  return (
    <div className={styles.row}>
      <a href={story.url} target="_blank" rel="noopener noreferrer">
        {story.title}
      </a>
      <div className={styles.meta}>
        {domain} · {relativeDate}
      </div>
      <OverflowMenu
        onEdit={() => setState("editing")}
        onDelete={() => setState("confirmDelete")}
      />
    </div>
  );
}
```

### 5. CreateStoryForm

**File:** `apps/kamp-us/src/components/library/CreateStoryForm.tsx`

```typescript
import {useState} from "react";
import {useMutation} from "react-relay";
import {Button} from "../../design/Button";
import {Field} from "../../design/Field";
import {Fieldset} from "../../design/Fieldset";
import {Input} from "../../design/Input";
import styles from "./CreateStoryForm.module.css";

export function CreateStoryForm() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [commit, isCreating] = useMutation(CreateStoryMutation);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    commit({
      variables: {url, title},
      onCompleted: (response) => {
        // Payload contains the story
        if (response.createStory.story) {
          setUrl("");
          setTitle("");
          setIsExpanded(false);
        }
      },
      onError: (err) => setError(err.message),
      // Update store to prepend new story
      updater: (store) => {
        // Relay store update logic
      },
    });
  };

  if (!isExpanded) {
    return (
      <button
        className={styles.collapsed}
        onClick={() => setIsExpanded(true)}
      >
        + Add a story...
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}

      <Fieldset.Root>
        <Fieldset.Legend>Add Story</Fieldset.Legend>

        <Field
          label="URL"
          control={
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
            />
          }
        />

        <Field
          label="Title"
          control={
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          }
        />
      </Fieldset.Root>

      <div className={styles.actions}>
        <Button type="button" onClick={() => setIsExpanded(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isCreating}>
          {isCreating ? "Saving..." : "Save Story"}
        </Button>
      </div>
    </form>
  );
}
```

---

## Key Implementation Decisions

### 1. Pagination Cursor Strategy

**Decision:** Use `id` (ULIDx) as cursor

**Rationale:**
- IDs from `@usirin/forge` are time-sortable (ULIDx)
- `ORDER BY id DESC` = chronological order
- Simpler query: `WHERE id < :cursor`
- Already unique and stable
- No timestamp conversion needed

### 2. Relay Fragment Colocation

**Decision:** Use fragments for StoryList and StoryRow

**Rationale:**
- Components declare their own data needs
- Enables automatic pagination with `usePaginationFragment`
- Better cache management

### 3. Row State Machine

**Decision:** StoryRow manages its own state (`display` | `editing` | `confirmDelete`)

**Rationale:**
- Keeps state local to the component
- Avoids global state management
- Simple transitions with `useState`

### 4. No Optimistic Updates

**Decision:** Wait for server response before updating UI

**Rationale:**
- Simpler implementation for MVP
- Server is fast (<300ms target)
- Can add optimistic updates later if needed

### 5. URL Validation

**Decision:** Browser's built-in URL validation (`type="url"`)

**Rationale:**
- Native validation is reliable
- Backend also validates via `normalizeUrl`
- No need for custom regex

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/kamp-us/src/pages/Library.tsx` | Page component |
| `apps/kamp-us/src/pages/Library.module.css` | Page styles |
| `apps/kamp-us/src/components/library/StoryList.tsx` | Paginated list |
| `apps/kamp-us/src/components/library/StoryRow.tsx` | Row with states |
| `apps/kamp-us/src/components/library/CreateStoryForm.tsx` | Create form |
| `apps/kamp-us/src/components/library/EmptyState.tsx` | Empty state |
| `apps/worker/test/library-stories.spec.ts` | Backend tests |

### Modified Files

| File | Changes |
|------|---------|
| `apps/worker/src/features/library/Library.ts` | Add `listStories`, `getStory`, `updateStory`, `deleteStory` |
| `apps/worker/src/features/library/schema.ts` | Add Story, StoryConnection schemas |
| `apps/worker/src/index.ts` | Add Library resolver, story mutations |
| `apps/kamp-us/src/main.tsx` | Add `/me/library` route |

---

## Testing Strategy

### Backend (Vitest)

```typescript
describe("Library Stories", () => {
  it("lists stories with pagination");
  it("returns null for non-existent story");
  it("updates story title");
  it("deletes story and its tag associations");
  it("respects cursor for pagination");
});
```

### Frontend (Manual + Future E2E)

1. Navigate to `/me/library` unauthenticated → redirects to login
2. Empty state displays correctly
3. Create story → appears in list
4. Edit story title → updates
5. Delete story → removed with confirmation
6. Load more → appends stories
