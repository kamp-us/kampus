# Frontend Story Tagging - Technical Design

This document describes the technical architecture for implementing the frontend story tagging feature based on the [requirements.md](./requirements.md).

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Relay)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Library.tsx                                                         │
│  ├── CreateStoryForm                                                │
│  │   └── TagInput (wraps Base UI Combobox)                          │
│  └── StoryRow                                                        │
│      ├── TagChip (standalone display)                               │
│      └── EditForm                                                    │
│          └── TagInput                                                │
├─────────────────────────────────────────────────────────────────────┤
│                    GraphQL (Relay Fragments)                         │
│  ├── LibraryTagsQuery (listTags)                                    │
│  ├── StoryFragment (includes tags)                                  │
│  ├── CreateTagMutation                                              │
│  ├── TagStoryMutation                                               │
│  └── UntagStoryMutation                                             │
├─────────────────────────────────────────────────────────────────────┤
│                      Backend (Cloudflare Worker)                     │
│  ├── GraphQL Resolvers (GQLoom)                                     │
│  └── Library DO (existing tag methods)                              │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Base UI Components

We leverage `@base-ui/react/combobox` for the tag input functionality. This provides:

- Multi-select with chips
- Keyboard navigation (arrow keys, Enter, Tab, Escape, Backspace)
- Filter-as-you-type
- Creatable pattern (for inline tag creation)
- Proper ARIA attributes
- Focus management

### Base UI Combobox Parts Used

| Component | Purpose |
|-----------|---------|
| `Combobox.Root` | Container with `multiple` prop |
| `Combobox.Chips` | Container for selected chips |
| `Combobox.Chip` | Individual selected tag chip |
| `Combobox.ChipRemove` | × button to remove chip |
| `Combobox.Input` | Text input for filtering |
| `Combobox.Portal` | Portal for dropdown |
| `Combobox.Positioner` | Dropdown positioning |
| `Combobox.Popup` | Dropdown container |
| `Combobox.List` | Options list |
| `Combobox.Item` | Individual option |
| `Combobox.Empty` | Empty state message |

## 3. File Structure

```
apps/kamp-us/src/
├── design/
│   ├── TagChip.tsx              # New - standalone tag display
│   ├── TagChip.module.css       # New
│   ├── TagInput.tsx             # New - wraps Base UI Combobox
│   ├── TagInput.module.css      # New
│   └── ... (existing)
├── pages/
│   └── Library.tsx              # Modified (add tag support)
└── __generated__/               # Relay artifacts (auto-generated)

apps/worker/src/
├── graphql/
│   └── relay.ts                 # Modified (add NodeType.Tag)
└── index.ts                     # Modified (add Tag resolvers)
```

## 4. Component Design

### 4.1 TagChip Component (Reusable Visual)

A pure visual component for rendering a tag as a colored pill. Used both:
- **Standalone** on story rows (read-only display)
- **Composed** inside `Combobox.Chip` in TagInput (interactive with remove button)

```typescript
// apps/kamp-us/src/design/TagChip.tsx

import type {ComponentProps} from "react";
import styles from "./TagChip.module.css";

type TagChipProps = {
  /** Tag name to display */
  name: string;
  /** 6-digit hex color (without #) */
  color: string;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional content (e.g., remove button) rendered after name */
  children?: React.ReactNode;
} & Omit<ComponentProps<"span">, "className" | "style" | "children">;

export function TagChip({
  name,
  color,
  size = "md",
  children,
  ...props
}: TagChipProps) {
  return (
    <span
      {...props}
      className={styles.TagChip}
      data-size={size}
      style={{"--tag-color": `#${color}`} as React.CSSProperties}
    >
      <span className={styles.ColorDot} />
      <span className={styles.Name}>{name}</span>
      {children}
    </span>
  );
}
```

**CSS Module** (`TagChip.module.css`):

```css
.TagChip {
  --tag-color: var(--gray-9);

  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-8);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  font-size: var(--font-size-1);
  line-height: var(--line-height-1);
  color: var(--gray-12);
  white-space: nowrap;
}

.TagChip[data-size="sm"] {
  padding: var(--space-1) var(--space-6);
  font-size: var(--font-size-0);
}

/* Support for Combobox.Chip keyboard navigation */
.TagChip[data-highlighted] {
  outline: 2px solid var(--blue-a8);
  outline-offset: 1px;
}

.ColorDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tag-color);
  flex-shrink: 0;
}

.TagChip[data-size="sm"] .ColorDot {
  width: 6px;
  height: 6px;
}

.Name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Usage Examples

**Standalone on story rows:**
```tsx
<TagChip name="productivity" color="FF6B6B" size="sm" />
```

**Composed inside Combobox.Chip (in TagInput):**
```tsx
<Combobox.Chip
  key={tag.id}
  value={tag}
  render={<TagChip name={tag.name} color={tag.color} />}
>
  <Combobox.ChipRemove className={styles.ChipRemove}>
    ×
  </Combobox.ChipRemove>
</Combobox.Chip>
```

The `render` prop allows TagChip to be the visual container while Combobox.Chip provides the interactive behavior (keyboard navigation, ARIA attributes). The `children` prop slot allows the remove button to be placed inside.

### 4.2 TagInput Component (Wraps Base UI Combobox)

Wraps Base UI Combobox with our styling, composes TagChip for visual consistency, and adds support for creating new tags inline.

```typescript
// apps/kamp-us/src/design/TagInput.tsx

import {Combobox} from "@base-ui/react/combobox";
import {useRef} from "react";
import {TagChip} from "./TagChip";
import styles from "./TagInput.module.css";

type Tag = {
  id: string;
  name: string;
  color: string;
  creatable?: boolean; // Flag for "Create new" option
};

type TagInputProps = {
  /** Currently selected tags */
  selectedTags: Tag[];
  /** All available tags for selection */
  availableTags: Tag[];
  /** Called when selection changes */
  onChange: (tags: Tag[]) => void;
  /** Called when a new tag should be created */
  onCreate: (name: string) => Promise<Tag>;
  /** Placeholder text */
  placeholder?: string;
};

export function TagInput({
  selectedTags,
  availableTags,
  onChange,
  onCreate,
  placeholder = "Add tags...",
}: TagInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build items list with "Create" option when needed
  const getItems = (inputValue: string): Tag[] => {
    const trimmed = inputValue.trim();
    const lowered = trimmed.toLowerCase();

    // Check if exact match exists
    const exactExists = availableTags.some(
      t => t.name.toLowerCase() === lowered
    );

    // Add creatable option if no exact match and input has value
    if (trimmed && !exactExists) {
      return [
        ...availableTags,
        {
          id: `create:${lowered}`,
          name: `Create "${trimmed}"`,
          color: "888888",
          creatable: true,
        },
      ];
    }

    return availableTags;
  };

  const handleValueChange = async (nextTags: Tag[]) => {
    // Check if user selected a "creatable" option
    const creatableTag = nextTags.find(
      t => t.creatable && !selectedTags.some(s => s.id === t.id)
    );

    if (creatableTag) {
      // Extract the name from "Create "name""
      const match = creatableTag.name.match(/^Create "(.+)"$/);
      if (match) {
        const newTag = await onCreate(match[1]);
        onChange([...selectedTags, newTag]);
      }
      return;
    }

    // Regular selection - filter out creatable items
    onChange(nextTags.filter(t => !t.creatable));
  };

  return (
    <Combobox.Root
      multiple
      value={selectedTags}
      onValueChange={handleValueChange}
      getItems={getItems}
    >
      <Combobox.Chips className={styles.Chips} ref={containerRef}>
        <Combobox.Value>
          {(tags: Tag[]) => (
            <>
              {tags.map(tag => (
                <Combobox.Chip
                  key={tag.id}
                  value={tag}
                  render={<TagChip name={tag.name} color={tag.color} />}
                >
                  <Combobox.ChipRemove
                    className={styles.ChipRemove}
                    aria-label={`Remove ${tag.name}`}
                  >
                    ×
                  </Combobox.ChipRemove>
                </Combobox.Chip>
              ))}
              <Combobox.Input
                ref={inputRef}
                className={styles.Input}
                placeholder={tags.length === 0 ? placeholder : ""}
              />
            </>
          )}
        </Combobox.Value>
      </Combobox.Chips>

      <Combobox.Portal>
        <Combobox.Positioner
          className={styles.Positioner}
          sideOffset={4}
          anchor={containerRef}
        >
          <Combobox.Popup className={styles.Popup}>
            <Combobox.Empty className={styles.Empty}>
              No tags found. Type to create one.
            </Combobox.Empty>
            <Combobox.List>
              {(tag: Tag) => (
                <Combobox.Item
                  key={tag.id}
                  className={styles.Item}
                  value={tag}
                  data-creatable={tag.creatable || undefined}
                >
                  {tag.creatable ? (
                    <>
                      <span className={styles.CreateIcon}>+</span>
                      {tag.name}
                    </>
                  ) : (
                    <>
                      <span
                        className={styles.ItemDot}
                        style={{background: `#${tag.color}`}}
                      />
                      {tag.name}
                    </>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
```

**CSS Module** (`TagInput.module.css`):

```css
/* Container for chips and input */
.Chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8);
  border: 1px solid var(--gray-a7);
  border-radius: var(--radius-4);
  background: var(--gray-1);
  min-height: 38px;
  cursor: text;
}

.Chips:focus-within {
  border-color: var(--sky-8);
  box-shadow: 0 0 0 2px var(--sky-4);
}

/* Chip remove button (inside TagChip via children) */
.ChipRemove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  margin-left: var(--space-2);
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--gray-9);
  cursor: pointer;
  font-size: 12px;
}

.ChipRemove:hover {
  background: var(--gray-6);
  color: var(--gray-12);
}

/* Text input */
.Input {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  outline: none;
  font-size: var(--font-size-2);
  color: var(--gray-12);
}

.Input::placeholder {
  color: var(--gray-9);
}

/* Dropdown */
.Positioner {
  z-index: 100;
  outline: none;
}

.Popup {
  width: var(--anchor-width);
  max-height: 200px;
  overflow-y: auto;
  padding: var(--space-4) 0;
  background: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-4);
  box-shadow:
    0 10px 38px -10px rgba(22, 23, 24, 0.35),
    0 10px 20px -15px rgba(22, 23, 24, 0.2);
}

.Empty {
  padding: var(--space-8) var(--space-12);
  font-size: var(--font-size-2);
  color: var(--gray-9);
}

.Empty:empty {
  display: none;
}

/* Dropdown items */
.Item {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-12);
  font-size: var(--font-size-2);
  color: var(--gray-12);
  cursor: pointer;
  outline: none;
}

.Item[data-highlighted] {
  background: var(--gray-4);
}

.Item[data-creatable] {
  color: var(--blue-11);
}

.ItemDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.CreateIcon {
  width: 10px;
  text-align: center;
  font-weight: 600;
}
```

Note: Chip visual styles (color, padding, dot) are handled by `TagChip.module.css`. The `render` prop on `Combobox.Chip` uses TagChip as the visual container, while `Combobox.Chip` provides keyboard navigation and ARIA attributes.

## 5. GraphQL Schema

### 5.1 Type Definitions

Add to `apps/worker/src/index.ts`:

```typescript
// Add NodeType.Tag to relay.ts
export const NodeType = {
  Story: "Story",
  Tag: "Tag",
} as const;

// Tag type schema (implements Node interface)
const Tag = Schema.Struct({
  __typename: Schema.optional(Schema.Literal("Tag")),
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  createdAt: Schema.String,
}).annotations({
  title: "Tag",
  [asObjectType]: {interfaces: [NodeInterface]},
});

// Helper to transform tag with global ID
function toTagNode(tag: {id: string; name: string; color: string; createdAt: Date}) {
  return {
    __typename: "Tag" as const,
    id: encodeGlobalId(NodeType.Tag, tag.id),
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}

// Mutation payloads
const TagNameExistsError = Schema.Struct({
  code: Schema.Literal("TAG_NAME_EXISTS"),
  message: Schema.String,
  tagName: Schema.String,
}).annotations({title: "TagNameExistsError"});

const CreateTagPayload = Schema.Struct({
  tag: Schema.NullOr(Tag),
  error: Schema.NullOr(TagNameExistsError),
}).annotations({title: "CreateTagPayload"});

// Note: No separate tagStory/untagStory mutations needed.
// Tagging is handled through createStory and updateStory flows.
```

### 5.2 Resolvers

```typescript
// Tag resolvers
const tagResolver = resolver({
  // Query: List all tags for the user
  listTags: query(standard(Schema.Array(Tag))).resolve(async () => {
    const ctx = useContext<GQLContext>();
    if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

    const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
    const lib = ctx.env.LIBRARY.get(libraryId);
    const tags = await lib.listTags();

    return tags.map(toTagNode);
  }),

  // Mutation: Create a new tag
  createTag: mutation(standard(CreateTagPayload))
    .input({
      name: standard(Schema.String),
      color: standard(Schema.String),
    })
    .resolve(async ({name, color}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      try {
        const tag = await lib.createTag(name, color);
        return {tag: toTagNode(tag), error: null};
      } catch (e) {
        if (e instanceof TagNameExistsError) {
          return {
            tag: null,
            error: {
              code: "TAG_NAME_EXISTS" as const,
              message: e.message,
              tagName: name,
            },
          };
        }
        throw e;
      }
    }),
});

// Update existing storyResolver to handle tags
const storyResolver = resolver.of(standard(Story), {
  // Update createStory to accept optional tagIds
  createStory: mutation(standard(CreateStoryPayload))
    .input({
      url: standard(Schema.String),
      title: standard(Schema.String),
      tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
    })
    .resolve(async ({url, title, tagIds}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);
      const story = await lib.createStory({url, title});

      // Tag the story if tagIds provided
      if (tagIds && tagIds.length > 0) {
        const localTagIds = tagIds
          .map(id => decodeGlobalId(id))
          .filter((d): d is {type: string; id: string} => d?.type === NodeType.Tag)
          .map(d => d.id);
        await lib.tagStory(story.id, localTagIds);
      }

      return {story: toStoryNode(story)};
    }),

  // Update updateStory to accept optional tagIds (replaces all tags)
  updateStory: mutation(standard(UpdateStoryPayload))
    .input({
      id: standard(Schema.String),
      title: standard(Schema.NullOr(Schema.String)),
      tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
    })
    .resolve(async ({id: globalId, title, tagIds}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

      const decoded = decodeGlobalId(globalId);
      if (!decoded || decoded.type !== NodeType.Story) {
        return {
          story: null,
          error: {code: "STORY_NOT_FOUND" as const, message: "Invalid story ID", storyId: globalId},
        };
      }

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      // Update title if provided
      const story = await lib.updateStory(decoded.id, {title: title ?? undefined});
      if (!story) {
        return {
          story: null,
          error: {code: "STORY_NOT_FOUND" as const, message: "Story not found", storyId: globalId},
        };
      }

      // Update tags if tagIds provided (replace all)
      if (tagIds !== null && tagIds !== undefined) {
        const localTagIds = tagIds
          .map(id => decodeGlobalId(id))
          .filter((d): d is {type: string; id: string} => d?.type === NodeType.Tag)
          .map(d => d.id);

        // Single method replaces all tags atomically
        await lib.setStoryTags(decoded.id, localTagIds);
      }

      return {story: toStoryNode(story), error: null};
    }),

  // Field resolver: tags on Story
  tags: field(standard(Schema.Array(Tag))).resolve(async (story) => {
    const ctx = useContext<GQLContext>();
    if (!ctx.pasaport.user?.id) return [];

    const decoded = decodeGlobalId(story.id);
    if (!decoded) return [];

    const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
    const lib = ctx.env.LIBRARY.get(libraryId);
    const tags = await lib.getTagsForStory(decoded.id);

    return tags.map(toTagNode);
  }),
});

// Update nodeResolver to handle Tag type
const nodeResolver = resolver({
  node: query(silk.nullable(silk<{__typename: string; id: string}>(NodeInterface)))
    .input({
      id: standard(Schema.String),
    })
    .resolve(async ({id: globalId}) => {
      const ctx = useContext<GQLContext>();
      if (!ctx.pasaport.user?.id) return null;

      const decoded = decodeGlobalId(globalId);
      if (!decoded) return null;

      const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
      const lib = ctx.env.LIBRARY.get(libraryId);

      switch (decoded.type) {
        case NodeType.Story: {
          const story = await lib.getStory(decoded.id);
          if (!story) return null;
          return {
            __typename: "Story" as const,
            id: globalId,
            url: story.url,
            title: story.title,
            createdAt: story.createdAt,
          };
        }
        case NodeType.Tag: {
          const tag = await lib.getTag(decoded.id);
          if (!tag) return null;
          return {
            __typename: "Tag" as const,
            id: globalId,
            name: tag.name,
            color: tag.color,
            createdAt: tag.createdAt.toISOString(),
          };
        }
        default:
          return null;
      }
    }),
});

// Update schema weave to include tagResolver
const schema = weave(
  EffectWeaver,
  asyncContextProvider,
  helloResolver,
  userResolver,
  libraryResolver,
  storyResolver,
  nodeResolver,
  tagResolver,
);
```

## 6. Relay Integration

### 6.1 Fragments and Queries

```graphql
# Fetch all available tags
query LibraryTagsQuery {
  listTags {
    id
    name
    color
  }
}

# Updated Story fragment to include tags
fragment LibraryStoryFragment on Story @refetchable(queryName: "LibraryStoryRefetchQuery") {
  id
  url
  title
  createdAt
  tags {
    id
    name
    color
  }
}

# Create tag mutation
mutation CreateTagMutation($name: String!, $color: String!) {
  createTag(name: $name, color: $color) {
    tag {
      id
      name
      color
    }
    error {
      code
      message
    }
  }
}

# Create story with optional tags
mutation LibraryCreateStoryMutation($url: String!, $title: String!, $tagIds: [String!]) {
  createStory(url: $url, title: $title, tagIds: $tagIds) {
    story {
      id
      url
      title
      createdAt
      tags {
        id
        name
        color
      }
    }
  }
}

# Update story with optional tags (replaces all tags)
mutation LibraryUpdateStoryMutation($id: String!, $title: String, $tagIds: [String!]) {
  updateStory(id: $id, title: $title, tagIds: $tagIds) {
    story {
      id
      title
      tags {
        id
        name
        color
      }
    }
    error {
      code
      message
    }
  }
}
```

### 6.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Library Page Load                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ 1. LibraryQuery fetches stories with tags                           │
│ 2. LibraryTagsQuery fetches all available tags                      │
│ 3. Both queries run in parallel                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Creating a Story with Tags                                          │
├─────────────────────────────────────────────────────────────────────┤
│ 1. User fills URL, Title, selects/creates tags                      │
│ 2. If new tag created: CreateTagMutation → add to local state       │
│ 3. User clicks Save                                                 │
│ 4. CreateStoryMutation with tagIds → creates story + tags in one    │
│ 5. Refetch stories list                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Editing Tags on Existing Story                                      │
├─────────────────────────────────────────────────────────────────────┤
│ 1. User clicks Edit on story row                                    │
│ 2. TagInput pre-populated with story.tags                           │
│ 3. User adds/removes tags                                           │
│ 4. User clicks Save                                                 │
│ 5. UpdateStoryMutation with tagIds → replaces all tags              │
│ 6. Refetch story via Node interface                                 │
└─────────────────────────────────────────────────────────────────────┘
```

Note: The frontend doesn't need to compute tag diffs. It simply passes the full list of selected tag IDs to `updateStory`, and the backend handles the diff internally.

## 7. State Management

### 7.1 Available Tags State

```typescript
// In Library.tsx or custom hook
function useAvailableTags() {
  const data = useLazyLoadQuery<LibraryTagsQueryType>(LibraryTagsQuery, {});
  const [localTags, setLocalTags] = useState<Tag[]>([]);

  const allTags = useMemo(() => {
    const combined = [...data.listTags, ...localTags];
    const seen = new Set<string>();
    return combined.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [data.listTags, localTags]);

  const addTag = useCallback((tag: Tag) => {
    setLocalTags(prev => [...prev, tag]);
  }, []);

  return {tags: allTags, addTag};
}
```

### 7.2 Form Tag State

```typescript
const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

// For edit mode, initialize from story.tags
useEffect(() => {
  if (isEditing && story.tags) {
    setSelectedTags(story.tags);
  }
}, [isEditing, story.tags]);
```

## 8. Default Color Assignment

```typescript
const TAG_COLORS = [
  "FF6B6B", // red
  "4ECDC4", // teal
  "45B7D1", // blue
  "FFA07A", // orange
  "98D8C8", // mint
  "F7DC6F", // yellow
  "BB8FCE", // purple
  "85C1E2", // sky
];

function getNextTagColor(existingTags: Tag[]): string {
  const index = existingTags.length % TAG_COLORS.length;
  return TAG_COLORS[index];
}
```

## 9. Component Summary

| Component | Source | Purpose |
|-----------|--------|---------|
| `TagChip` | Custom | Reusable visual component for tag display |
| `TagInput` | Wraps Base UI Combobox | Tag selection/creation in forms |
| `Combobox.*` | `@base-ui/react/combobox` | Provides all combobox primitives |

### TagChip Reuse Pattern

TagChip is a **pure visual component** used in two contexts:

1. **Standalone** (story rows): `<TagChip name="..." color="..." size="sm" />`
2. **Composed** (TagInput): `<Combobox.Chip render={<TagChip ... />}>...</Combobox.Chip>`

This ensures visual consistency while letting Base UI handle interactive behavior.

### What Base UI Provides (no custom code needed):

- Keyboard navigation (arrows, Enter, Tab, Escape, Backspace)
- ARIA attributes and accessibility
- Focus management
- Multi-select with chips
- Dropdown positioning
- Filter-as-you-type

### What We Customize:

- Styling with phoenix design tokens
- Color dot indicators for tags (via TagChip)
- "Create new tag" option in dropdown
- Integration with GraphQL mutations

## 10. Backend Changes

### 10.1 Existing Methods (Keep)

The Library DO already has these methods that we keep:
- `tagStory(storyId, tagId)` - Add a single tag to a story
- `untagStory(storyId, tagId)` - Remove a single tag from a story

### 10.2 New Library DO Method

Add `setStoryTags` method to `Library.ts` that computes the diff and uses tagStory/untagStory internally. This is more efficient than DELETE ALL + INSERT ALL:

```typescript
// In Library.ts
async setStoryTags(storyId: string, tagIds: string[]) {
  // Get current tags for this story
  const currentTags = await this.getTagsForStory(storyId);
  const currentIds = new Set(currentTags.map(t => t.id));
  const newIds = new Set(tagIds);

  // Compute diff
  const toRemove = currentTags
    .filter(t => !newIds.has(t.id))
    .map(t => t.id);
  const toAdd = tagIds.filter(id => !currentIds.has(id));

  // Apply changes using existing methods
  for (const tagId of toRemove) {
    await this.untagStory(storyId, tagId);
  }
  for (const tagId of toAdd) {
    await this.tagStory(storyId, tagId);
  }
}
```

**Benefits of this approach:**
- Reuses existing `tagStory`/`untagStory` methods (DRY)
- Only modifies rows that actually change (efficient for junction table)
- No unnecessary DELETEs when tags haven't changed
- Easier to add logging/hooks per tag operation in the future

## 11. Migration Notes

### 11.1 No Database Changes

Tag tables already exist.

### 10.2 GraphQL Schema (Additive)

New fields and mutations, no breaking changes.

### 10.3 Relay Artifacts

After implementation:
```bash
pnpm --filter kamp-us run schema:fetch
pnpm --filter kamp-us run relay
```

## 11. Open Questions Resolved

| Question | Decision |
|----------|----------|
| State management | Local state + Relay queries |
| Relay fragments | Add `tags` field to StoryFragment |
| Optimistic updates | No - refetch after mutations |
| Default color | Rotate through 8-color palette |
| Build vs reuse | Use Base UI Combobox, build TagChip |
