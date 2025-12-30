# Frontend Tag Filtering - Technical Design

This document describes the technical architecture for implementing the frontend tag filtering feature based on the [requirements.md](./requirements.md).

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Relay)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Library.tsx                                                         │
│  ├── CreateStoryForm                                                │
│  ├── TagFilterRow (NEW)                                             │
│  │   └── TagChip (dismissible, shows active filter)                 │
│  └── StoryList                                                       │
│      └── StoryRow                                                    │
│          └── TagChip (clickable, triggers filter)                   │
├─────────────────────────────────────────────────────────────────────┤
│                    URL State (react-router)                          │
│  └── useSearchParams → ?tag=tag-name                                │
├─────────────────────────────────────────────────────────────────────┤
│                    GraphQL (Relay)                                   │
│  ├── LibraryQuery (existing - all stories)                          │
│  └── LibraryFilteredQuery (NEW - storiesByTag)                      │
├─────────────────────────────────────────────────────────────────────┤
│                      Backend (Cloudflare Worker)                     │
│  ├── GraphQL Resolvers (GQLoom)                                     │
│  │   └── Library.storiesByTag resolver                              │
│  └── Library DO                                                      │
│      └── getStoriesByTagName method                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. URL State Management

### 2.1 Hook: useTagFilter

Hook to read filter state and provide clear action:

```typescript
// apps/kamp-us/src/pages/Library.tsx (or separate hook file)

import {useSearchParams} from "react-router";
import {useCallback} from "react";

type TagFilterState = {
  /** Currently active tag name, or null if showing all */
  activeTag: string | null;
  /** Clear filter (button action) */
  clearFilter: () => void;
};

function useTagFilter(): TagFilterState {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTag = searchParams.get("tag");

  const clearFilter = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return {activeTag, clearFilter};
}
```

- **Navigation to filter**: Handled declaratively via `<Link to="?tag=name">`
- **Clear filter action**: Handled via `clearFilter()` button click

### 2.2 URL Examples

| State | URL |
|-------|-----|
| All stories | `/me/library` |
| Filtered by "productivity" | `/me/library?tag=productivity` |
| Filtered by "my-awesome-tag" | `/me/library?tag=my-awesome-tag` |

## 3. GraphQL Schema Changes

### 3.1 New Field: Library.storiesByTag

Add to the Library type:

```typescript
// apps/worker/src/index.ts - libraryResolver

const libraryResolver = resolver.of(standard(Library), {
  // Existing: stories(first, after) -> StoryConnection
  stories: field(standard(StoryConnection))
    .input({
      first: standard(Schema.Number),
      after: standard(Schema.NullOr(Schema.String)),
    })
    .resolve(async ({first, after}) => {
      // ... existing implementation
    }),

  // NEW: storiesByTag(tagName, first, after) -> StoryConnection
  storiesByTag: field(standard(StoryConnection))
    .input({
      tagName: standard(Schema.String),
      first: standard(Schema.Number),
      after: standard(Schema.NullOr(Schema.String)),
    })
    .resolve(async ({tagName, first, after}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      const result = await lib.getStoriesByTagName(tagName, {first, after});

      return {
        edges: result.stories.map(story => ({
          node: toStoryNode(story),
          cursor: encodeCursor(story.id),
        })),
        pageInfo: {
          hasNextPage: result.hasNextPage,
          endCursor: result.endCursor,
        },
      };
    }),
});
```

### 3.2 Library DO Method

Add to `apps/worker/src/features/library/Library.ts`:

```typescript
async getStoriesByTagName(
  tagName: string,
  options: {first: number; after?: string | null}
): Promise<{
  stories: StoryRow[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  // 1. Find tag by name
  const [tag] = await this.db
    .select()
    .from(schema.tag)
    .where(eq(schema.tag.name, tagName))
    .limit(1);

  if (!tag) {
    // Tag doesn't exist - return empty
    return {stories: [], hasNextPage: false, endCursor: null};
  }

  // 2. Get stories with this tag via junction table
  const limit = options.first + 1; // Fetch one extra to check hasNextPage

  let query = this.db
    .select({story: schema.story})
    .from(schema.storyTag)
    .innerJoin(schema.story, eq(schema.storyTag.storyId, schema.story.id))
    .where(eq(schema.storyTag.tagId, tag.id))
    .orderBy(desc(schema.story.createdAt))
    .limit(limit);

  if (options.after) {
    const cursorId = decodeCursor(options.after);
    const cursorStory = await this.db
      .select()
      .from(schema.story)
      .where(eq(schema.story.id, cursorId))
      .limit(1);

    if (cursorStory[0]) {
      query = query.where(lt(schema.story.createdAt, cursorStory[0].createdAt));
    }
  }

  const results = await query;
  const stories = results.map(r => r.story);

  const hasNextPage = stories.length > options.first;
  if (hasNextPage) {
    stories.pop(); // Remove the extra item
  }

  return {
    stories,
    hasNextPage,
    endCursor: stories.length > 0 ? encodeCursor(stories[stories.length - 1].id) : null,
  };
}
```

## 4. Relay Queries

### 4.1 Filtered Query

```graphql
# New query for filtered stories
query LibraryFilteredQuery($tagName: String!, $first: Float!, $after: String) {
  me {
    library {
      storiesByTag(tagName: $tagName, first: $first, after: $after) {
        edges {
          node {
            ...LibraryStoryFragment
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
```

### 4.2 Query Selection Strategy

The Library page conditionally executes one of two queries based on URL state:

```typescript
function AuthenticatedLibrary() {
  const {activeTag} = useTagFilter();

  // Choose query based on filter state
  if (activeTag) {
    return <FilteredLibraryContent tagName={activeTag} />;
  }

  return <AllStoriesContent />;
}

function FilteredLibraryContent({tagName}: {tagName: string}) {
  const data = useLazyLoadQuery<LibraryFilteredQueryType>(
    LibraryFilteredQuery,
    {tagName, first: DEFAULT_PAGE_SIZE}
  );

  const stories = data.me?.library?.storiesByTag?.edges ?? [];
  // ... render with TagFilterRow showing active filter
}

function AllStoriesContent() {
  const data = useLazyLoadQuery<LibraryQueryType>(
    LibraryQuery,
    {first: DEFAULT_PAGE_SIZE}
  );

  const stories = data.me?.library?.stories?.edges ?? [];
  // ... render with TagFilterRow showing "All stories"
}
```

## 5. Component Design

### 5.1 TagFilterRow Component

New component that displays filter state and count:

```typescript
// apps/kamp-us/src/pages/Library.tsx (inline component)

import {Button} from "@base-ui/react/button";
import {TagChip} from "../design/TagChip";
import styles from "./Library.module.css";

type TagFilterRowProps = {
  /** Active tag name, or null if showing all */
  activeTag: string | null;
  /** Tag details (for color), fetched from available tags */
  tagDetails: {name: string; color: string} | null;
  /** Number of stories currently displayed */
  storyCount: number;
  /** Callback to clear filter */
  onClearFilter: () => void;
};

function TagFilterRow({
  activeTag,
  tagDetails,
  storyCount,
  onClearFilter,
}: TagFilterRowProps) {
  const storyLabel = storyCount === 1 ? "story" : "stories";

  if (!activeTag) {
    // Unfiltered state
    return (
      <div className={styles.TagFilterRow}>
        <span className={styles.FilterLabel}>All stories</span>
        <span className={styles.StoryCount}>
          {storyCount} {storyLabel}
        </span>
      </div>
    );
  }

  // Filtered state - TagChip with dismiss button as children
  return (
    <div className={styles.TagFilterRow}>
      <span className={styles.FilterLabel}>Filtered by</span>
      <TagChip name={activeTag} color={tagDetails?.color ?? "888888"}>
        <button
          type="button"
          className={styles.DismissButton}
          onClick={onClearFilter}
          aria-label={`Clear filter: ${activeTag}`}
        >
          ×
        </button>
      </TagChip>
      <span className={styles.StoryCount}>
        {storyCount} {storyLabel}
      </span>
    </div>
  );
}
```

**CSS:**

```css
/* apps/kamp-us/src/pages/Library.module.css */

.TagFilterRow {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) 0;
  border-bottom: 1px solid var(--gray-a4);
  margin-bottom: var(--space-8);
}

.FilterLabel {
  font-size: var(--font-size-2);
  color: var(--gray-11);
}

.StoryCount {
  font-size: var(--font-size-2);
  color: var(--gray-9);
  margin-left: auto;
}

.DismissIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: var(--space-4);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: var(--gray-9);
  cursor: pointer;
}

.DismissIcon:hover {
  background: var(--gray-a4);
  color: var(--gray-12);
}

/* Clickable TagChip variant */
[data-dismissible] {
  cursor: pointer;
}

[data-dismissible]:hover {
  background: color-mix(in srgb, var(--tag-color) 20%, transparent);
}
```

### 5.2 TagChip Enhancement

Modify TagChip so the **name itself is a link**. The close button stays as `children`.

```typescript
// apps/kamp-us/src/design/TagChip.tsx

import type {ComponentProps, ReactNode} from "react";
import {Link} from "react-router";
import styles from "./TagChip.module.css";

type TagChipProps = {
  /** Tag name to display */
  name: string;
  /** 6-digit hex color (without #) */
  color: string;
  /** Link destination for the tag name */
  to?: string;
  /** Additional content (e.g., close button) rendered after name */
  children?: ReactNode;
} & Omit<ComponentProps<"span">, "className" | "style" | "children">;

export function TagChip({name, color, to, children, ...props}: TagChipProps) {
  return (
    <span
      {...props}
      className={styles.TagChip}
      style={{"--tag-color": `#${color}`} as React.CSSProperties}
    >
      <span className={styles.ColorDot} />
      {to ? (
        <Link to={to} className={styles.Name}>{name}</Link>
      ) : (
        <span className={styles.Name}>{name}</span>
      )}
      {children}
    </span>
  );
}
```

**Usage:**

```tsx
// StoryRow - clickable tag (name is link)
<TagChip
  name={tag.name}
  color={tag.color}
  to={`/me/library?tag=${tag.name}`}
/>

// TagFilterRow - with dismiss button
<TagChip name={activeTag} color={tagDetails?.color ?? "888888"}>
  <Button
    className={styles.DismissButton}
    onClick={clearFilter}
    aria-label={`Clear filter: ${activeTag}`}
  >
    ×
  </Button>
</TagChip>
```

**CSS:**

```css
/* apps/kamp-us/src/design/TagChip.module.css */

.Name {
  /* When it's a link */
  text-decoration: none;
  color: inherit;
}

.Name:hover {
  text-decoration: underline;
}
```

**Benefits:**
- Name is the link - clear and semantic
- Close button is separate (passed as children)
- Simple prop: just add `to` to make it clickable

### 5.3 StoryRow Tags

Update StoryRow to pass `to` prop to TagChip:

```typescript
// In StoryRow component, tag display section

function StoryRow({storyRef, onStoryDeleted, availableTags, onTagCreate}: StoryRowProps) {
  // ... existing code

  const visibleTags = story.tags.slice(0, 3);
  const remainingCount = story.tags.length - 3;

  return (
    <article className={styles.StoryRow}>
      {/* ... existing content */}
      <div className={styles.TagList}>
        {visibleTags.map(tag => (
          <TagChip
            key={tag.id}
            name={tag.name}
            color={tag.color}
            to={`/me/library?tag=${tag.name}`}
          />
        ))}
        {remainingCount > 0 && (
          <span className={styles.MoreTags}>+{remainingCount} more</span>
        )}
      </div>
    </article>
  );
}
```

### 5.4 Empty State

When filter returns zero results:

```typescript
function FilteredEmptyState({
  tagName,
  onClearFilter,
}: {
  tagName: string;
  onClearFilter: () => void;
}) {
  return (
    <div className={styles.EmptyState}>
      <p>No stories tagged "{tagName}"</p>
      <Button variant="outline" onClick={onClearFilter}>
        Show all stories
      </Button>
    </div>
  );
}
```

## 6. Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Initial Page Load                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ 1. useTagFilter reads ?tag param from URL                           │
│ 2. If tag param exists → LibraryFilteredQuery                       │
│ 3. If no tag param → LibraryQuery (all stories)                     │
│ 4. TagFilterRow displays current state                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ User Clicks Tag Name on Story Row                                    │
├─────────────────────────────────────────────────────────────────────┤
│ 1. TagChip name renders as <Link to="?tag=foo">                     │
│ 2. Click triggers react-router navigation                          │
│ 3. URL updates to ?tag=tagName                                      │
│ 4. React re-renders, useTagFilter returns new tag                   │
│ 5. FilteredLibraryContent executes LibraryFilteredQuery             │
│ 6. TagFilterRow updates to show active tag                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ User Clicks Dismiss Button (×)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Dismiss button onClick calls clearFilter()                       │
│ 2. setSearchParams({}) removes tag param from URL                   │
│ 3. React re-renders, useTagFilter returns null                      │
│ 4. AllStoriesContent executes LibraryQuery                          │
│ 5. TagFilterRow shows "All stories"                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ User Clicks Different Tag While Filtered                             │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Same as "Clicks Tag" flow                                        │
│ 2. Link replaces existing ?tag param in URL                         │
│ 3. Filter switches to new tag                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## 7. Tag Color Lookup

The TagFilterRow needs the tag color for display. Two approaches:

### Option A: Lookup from Available Tags (Recommended)

```typescript
function AuthenticatedLibrary() {
  const {activeTag, clearFilter} = useTagFilter();
  const {tags: availableTags} = useAvailableTags();

  // Find tag details for active filter
  const activeTagDetails = activeTag
    ? availableTags.find(t => t.name === activeTag) ?? null
    : null;

  // ... render TagFilterRow with activeTagDetails
}
```

### Option B: Include in Query Response

Add a `tag` field to the filtered query response. Not recommended - adds complexity.

**Decision: Option A** - Use existing `useAvailableTags` hook to lookup tag color.

## 8. Loading States

### 8.1 Initial Load

Uses existing `LibrarySkeleton` component.

### 8.2 Filter Transition

When switching between filters, Relay's Suspense boundary shows skeleton:

```typescript
function AuthenticatedLibrary() {
  const {activeTag} = useTagFilter();

  return (
    <Suspense fallback={<LibrarySkeleton />}>
      {activeTag ? (
        <FilteredLibraryContent tagName={activeTag} />
      ) : (
        <AllStoriesContent />
      )}
    </Suspense>
  );
}
```

Since navigation is handled by `<Link>`, transitions happen automatically via react-router. The Suspense boundary will show the skeleton during the query fetch.

## 9. Component Hierarchy Update

```
Library
└── ErrorBoundary
    └── Suspense (LibrarySkeleton)
        └── LibraryContent
            └── AuthenticatedLibrary
                ├── CreateStoryForm
                ├── TagFilterRow (NEW)
                │   └── TagChip (dismissible)
                └── Suspense (transition)
                    ├── AllStoriesContent (when no filter)
                    │   └── StoryRow[]
                    │       └── TagChip[] (clickable)
                    └── FilteredLibraryContent (when filtered)
                        ├── StoryRow[]
                        │   └── TagChip[] (clickable)
                        └── FilteredEmptyState (when 0 results)
```

## 10. File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/worker/src/index.ts` | Modify | Add `storiesByTag` resolver to Library |
| `apps/worker/src/features/library/Library.ts` | Modify | Add `getStoriesByTagName` method |
| `apps/kamp-us/src/pages/Library.tsx` | Modify | Add TagFilterRow, useTagFilter, conditional queries |
| `apps/kamp-us/src/pages/Library.module.css` | Modify | Add TagFilterRow, DismissButton styles |
| `apps/kamp-us/src/design/TagChip.tsx` | Modify | Add `to` prop for link navigation |
| `apps/kamp-us/src/design/TagChip.module.css` | Modify | Add link hover styles |

## 11. Open Questions Resolved

| Question | Decision |
|----------|----------|
| Relay fragment strategy | Separate query (LibraryFilteredQuery), reuse StoryFragment |
| Loading state | Suspense boundary with skeleton, optional useTransition |
| Tag color lookup | From useAvailableTags hook (already loaded) |
| Count source | From edges.length (client-side, after fetch) |

## 12. Testing Considerations

- Direct URL navigation: `/me/library?tag=nonexistent` should show empty state
- Browser back/forward: Filter state should update correctly
- Tag click while loading: Should queue or debounce
- Tag with special characters in name: URL encoding/decoding
