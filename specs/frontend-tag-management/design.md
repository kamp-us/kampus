# Frontend Tag Management - Technical Design

**Derived from:** [requirements.md](./requirements.md)

## Architecture Overview

```
/library/tags route
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  TagManagementPage                                      │
│  ├── Header (title + back link)                         │
│  ├── CreateTagButton                                    │
│  └── TagList                                            │
│      └── TagRow (repeating)                             │
│          ├── TagChip (existing component)               │
│          ├── Story count badge                          │
│          └── Menu (Rename, Change color, Delete)        │
│              ├── InlineRenameDialog                     │
│              ├── ColorPickerPopover (new component)     │
│              └── DeleteTagDialog                        │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/kamp-us/src/
├── design/
│   ├── ColorPicker.tsx          # New component
│   └── ColorPicker.module.css
└── pages/
    └── library/
        ├── TagManagement.tsx    # New page component
        └── TagManagement.module.css
```

## Component Design

### 1. TagManagementPage

**Location:** `apps/kamp-us/src/pages/library/TagManagement.tsx`

**Route:** `/library/tags`

**Query:**
```graphql
query TagManagementQuery {
  viewer {
    tags(first: 100) {
      edges {
        node {
          id
          name
          color
          stories(first: 0) {
            totalCount
          }
        }
      }
    }
  }
}
```

**Structure:**
```typescript
function TagManagementPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        <TagManagementContent />
      </Suspense>
    </ErrorBoundary>
  );
}

function TagManagementContent() {
  const data = useLazyLoadQuery<TagManagementQuery>(query, {});
  const tags = data.viewer?.tags?.edges?.map(e => e.node) ?? [];

  // Sort alphabetically
  const sortedTags = [...tags].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <div className={styles.container}>
      <Header />
      <TagList tags={sortedTags} />
    </div>
  );
}
```

### 2. TagRow Component

**State management per row:**
```typescript
type TagRowState =
  | { mode: "view" }
  | { mode: "rename"; value: string }
  | { mode: "color-picker" }
  | { mode: "delete-confirm" };
```

**Structure:**
```typescript
function TagRow({ tag }: { tag: TagNode }) {
  const [state, setState] = useState<TagRowState>({ mode: "view" });
  const [updateTag] = useMutation(UpdateTagMutation);
  const [deleteTag] = useMutation(DeleteTagMutation);

  return (
    <div className={styles.row}>
      {state.mode === "rename" ? (
        <InlineRenameInput
          value={state.value}
          onSave={(name) => handleRename(name)}
          onCancel={() => setState({ mode: "view" })}
        />
      ) : (
        <>
          <TagChip name={tag.name} color={tag.color} />
          <span className={styles.storyCount}>
            {tag.stories.totalCount} stories
          </span>
        </>
      )}

      <Menu.Root>
        <Menu.Trigger aria-label={`Options for ${tag.name}`}>
          <MoreHorizontalIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item onClick={() => setState({ mode: "rename", value: tag.name })}>
                Rename
              </Menu.Item>
              <Menu.Item onClick={() => setState({ mode: "color-picker" })}>
                Change color
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item data-danger onClick={() => setState({ mode: "delete-confirm" })}>
                Delete
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* ColorPicker Popover */}
      <ColorPicker
        open={state.mode === "color-picker"}
        onOpenChange={(open) => !open && setState({ mode: "view" })}
        selectedColor={tag.color}
        onSelect={(color) => handleColorChange(color)}
      />

      {/* Delete Confirmation */}
      <AlertDialog.Root
        open={state.mode === "delete-confirm"}
        onOpenChange={(open) => !open && setState({ mode: "view" })}
      >
        {/* ... */}
      </AlertDialog.Root>
    </div>
  );
}
```

### 3. ColorPicker Component (New)

**Location:** `apps/kamp-us/src/design/ColorPicker.tsx`

**Design:** Uses Base UI Popover pattern

```typescript
import * as Popover from "@base-ui/react/popover";

const TAG_COLORS = [
  { hex: "FF6B6B", name: "Red" },
  { hex: "4ECDC4", name: "Teal" },
  { hex: "45B7D1", name: "Blue" },
  { hex: "FFA07A", name: "Orange" },
  { hex: "98D8C8", name: "Mint" },
  { hex: "F7DC6F", name: "Yellow" },
  { hex: "BB8FCE", name: "Purple" },
  { hex: "85C1E2", name: "Sky" },
];

type ColorPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedColor: string;
  onSelect: (color: string) => void;
  anchor?: Popover.Root.Props["anchor"];
};

export function ColorPicker({
  open,
  onOpenChange,
  selectedColor,
  onSelect,
  anchor
}: ColorPickerProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Portal>
        <Popover.Positioner anchor={anchor} sideOffset={4}>
          <Popover.Popup className={styles.popup}>
            <div className={styles.swatches}>
              {TAG_COLORS.map(({ hex, name }) => (
                <button
                  key={hex}
                  className={styles.swatch}
                  style={{ backgroundColor: `#${hex}` }}
                  aria-label={name}
                  aria-pressed={hex === selectedColor}
                  onClick={() => {
                    onSelect(hex);
                    onOpenChange(false);
                  }}
                />
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

**CSS:**
```css
.popup {
  background: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-4);
  padding: var(--space-8);
  box-shadow: var(--shadow-2);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-8);
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-round);
  border: 2px solid transparent;
  cursor: pointer;
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch[aria-pressed="true"] {
  border-color: var(--gray-12);
}

.swatch:focus-visible {
  outline: 2px solid var(--sky-8);
  outline-offset: 2px;
}
```

### 4. InlineRenameInput Component

**Inline within TagRow:**
```typescript
function InlineRenameInput({
  value,
  onSave,
  onCancel,
  error
}: {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  error?: string;
}) {
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(inputValue.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className={styles.renameContainer}>
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        aria-invalid={!!error}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
```

### 5. Delete Confirmation Dialog

**Pattern from Library.tsx:**
```typescript
<AlertDialog.Root open={state.mode === "delete-confirm"} onOpenChange={...}>
  <AlertDialog.Portal>
    <AlertDialog.Backdrop />
    <AlertDialog.Popup>
      <AlertDialog.Title>Delete "{tag.name}"?</AlertDialog.Title>
      <AlertDialog.Description>
        This will remove the tag from {tag.stories.totalCount} stories.
        The stories themselves will not be deleted.
      </AlertDialog.Description>
      <div className={styles.dialogActions}>
        <AlertDialog.Close render={<Button />}>Cancel</AlertDialog.Close>
        <Button onClick={handleDelete}>Delete</Button>
      </div>
    </AlertDialog.Popup>
  </AlertDialog.Portal>
</AlertDialog.Root>
```

## GraphQL Mutations

### UpdateTag Mutation

```graphql
mutation TagManagementUpdateTagMutation($id: String!, $name: String, $color: String) {
  updateTag(id: $id, name: $name, color: $color) {
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
```

### DeleteTag Mutation

```graphql
mutation TagManagementDeleteTagMutation($id: String!) {
  deleteTag(id: $id) {
    deletedTagId
    error {
      code
      message
    }
  }
}
```

## Backend: Connection totalCount

### Add totalCount to StoryConnection Schema

In `apps/worker/src/index.ts`, add `totalCount` to the connection schema:

```typescript
const StoryConnection = Schema.Struct({
  edges: Schema.Array(StoryEdge),
  pageInfo: PageInfo,
  totalCount: Schema.Number,  // NEW FIELD
}).annotations({title: "StoryConnection"});
```

### Update Library DO Methods

Methods returning connections need to include `totalCount`:

```typescript
// In Library.ts - update storiesByTag method
async storiesByTag(tagName: string, options?: {...}) {
  // ... existing query logic ...

  // Add total count query
  const [{ count }] = await this.db
    .select({ count: sql<number>`count(*)` })
    .from(schema.story)
    .innerJoin(schema.storyTag, eq(schema.story.id, schema.storyTag.storyId))
    .innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
    .where(eq(sql`lower(${schema.tag.name})`, tagName.toLowerCase()));

  return {
    edges: edges.map((s) => ({...s, createdAt: s.createdAt.toISOString()})),
    hasNextPage,
    endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
    totalCount: count,  // NEW FIELD
  };
}
```

### Update Resolver to Pass Through totalCount

```typescript
// In libraryResolver.storiesByTag
return {
  edges: result.edges.map((story) => ({
    node: toStoryNode(story),
    cursor: encodeGlobalId(NodeType.Story, story.id),
  })),
  pageInfo: {
    hasNextPage: result.hasNextPage,
    hasPreviousPage: false,
    startCursor: result.edges[0] ? encodeGlobalId(...) : null,
    endCursor: result.endCursor ? encodeGlobalId(...) : null,
  },
  totalCount: result.totalCount,  // NEW FIELD
};
```

### Add Tag.stories Field

Add a `stories` field on Tag type to query stories by that tag:

```typescript
const tagResolver = resolver.of(standard(Tag), {
  stories: field(standard(StoryConnection))
    .input({
      first: standard(Schema.NullOr(Schema.Number)),
    })
    .resolve(async (parent, input) => {
      const library = await getLibrary();
      const result = await library.storiesByTag(parent.name, {
        first: input.first ?? 0,
      });
      // Transform and return connection
    }),
});
```

## Routing

Add route to router configuration:

```typescript
// In routes configuration
{
  path: "/library/tags",
  element: <TagManagementPage />,
}
```

Add navigation link from Library page:

```typescript
// In Library.tsx header area
<Link to="/library/tags">Manage Tags</Link>
```

## Error Handling

| Error Code | Handling |
|------------|----------|
| `TAG_NAME_EXISTS` | Show inline error on rename input |
| `TAG_NOT_FOUND` | Remove row from UI, show toast |
| `UNAUTHORIZED` | Redirect to login |

## Optimistic Updates

For immediate feedback:

```typescript
const [updateTag] = useMutation(UpdateTagMutation, {
  optimisticResponse: {
    updateTag: {
      tag: {
        id: tag.id,
        name: newName,
        color: tag.color,
      },
      error: null,
    },
  },
});
```

## Accessibility Considerations

| Element | Accessibility |
|---------|---------------|
| ColorPicker swatches | `aria-label` with color name, `aria-pressed` for selected |
| Menu trigger | `aria-label="Options for {tag.name}"` |
| Delete dialog | Focus trapped, Escape to close |
| Inline rename | Auto-focus, Enter/Escape keyboard handling |

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      TagRow                              │
│  ┌──────────┐                                           │
│  │  VIEW    │◄──────────────────────────────────────┐   │
│  └────┬─────┘                                       │   │
│       │ Menu actions                                │   │
│       ▼                                             │   │
│  ┌──────────┐    Enter/success    ┌──────────────┐ │   │
│  │ RENAME   │─────────────────────►│ UPDATE API  │─┘   │
│  └────┬─────┘                      └──────────────┘     │
│       │ Escape                                          │
│       └────────────────────────────────────────────┐    │
│  ┌──────────┐    Select color     ┌──────────────┐ │   │
│  │ COLOR    │─────────────────────►│ UPDATE API  │─┘   │
│  │ PICKER   │                      └──────────────┘     │
│  └────┬─────┘                                          │
│       │ Click outside                                   │
│       └────────────────────────────────────────────┐    │
│  ┌──────────┐    Confirm          ┌──────────────┐ │   │
│  │ DELETE   │─────────────────────►│ DELETE API  │─┘   │
│  │ CONFIRM  │                      └──────────────┘     │
│  └────┬─────┘                                          │
│       │ Cancel                                          │
│       └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `@base-ui/react/popover` | ColorPicker popover |
| Existing: TagChip | Tag display |
| Existing: AlertDialog | Delete confirmation |
| Existing: Menu | Row actions |
| Existing: Input | Inline rename |
| Existing: Button | Dialog actions |
