# Technical Design: Fetch Title from URL

**Status:** Phase 3 - Technical Design
**Source:** [requirements.md](./requirements.md)

## Executive Summary

The `WebPageParser` Durable Object already exists with full metadata fetching and caching capabilities. This feature requires:

1. **Backend:** Add a GraphQL query to expose `WebPageParser.getMetadata()`
2. **Backend:** Add `description` input to `createStory` mutation
3. **Frontend:** Add `Textarea` component to design system
4. **Frontend:** Add fetch button and description field to story form

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EXISTING INFRASTRUCTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  WebPageParser DO (apps/worker/src/features/web-page-parser/)       │
│  ├── getMetadata(options?: {forceFetch?: boolean})                  │
│  ├── Uses HTMLRewriter for parsing                                  │
│  ├── Caches results in SQLite (24hr TTL)                           │
│  └── Returns { title: string, description: string | null }         │
│                                                                     │
│  fetchPageMetadata.ts                                               │
│  ├── Parses: og:title > <title>                                    │
│  └── Parses: og:description > meta[name="description"]             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NEW: GraphQL Query                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  fetchUrlMetadata(url: String!): UrlMetadata!                      │
│  ├── Validates URL format                                          │
│  ├── Gets WebPageParser stub via idFromName(normalizedUrl)         │
│  ├── Calls stub.init(url) then stub.getMetadata()                  │
│  └── Returns { title, description, error }                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Backend Design

### 1. GraphQL Query: `fetchUrlMetadata`

**Location:** `apps/worker/src/index.ts`

```typescript
// Schema definition
const UrlMetadata = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
}).annotations({title: "UrlMetadata"});

// Query resolver
const urlMetadataResolver = resolver({
  fetchUrlMetadata: query(standard(UrlMetadata))
    .input({
      url: standard(Schema.String),
    })
    .resolve(async ({url}) => {
      const ctx = useContext<GQLContext>();

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {title: null, description: null, error: "Invalid URL format"};
      }

      // Only allow http/https (SSRF prevention)
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {title: null, description: null, error: "Only HTTP/HTTPS URLs are allowed"};
      }

      try {
        // Use normalized URL as DO key for deduplication
        const normalizedUrl = getNormalizedUrl(url);
        const parserId = ctx.env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
        const parser = ctx.env.WEB_PAGE_PARSER.get(parserId);

        await parser.init(url);
        const metadata = await parser.getMetadata();

        return {
          title: metadata.title || null,
          description: metadata.description || null,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch metadata";
        return {title: null, description: null, error: message};
      }
    }),
});
```

**Key Decisions:**
- **No authentication required:** Public endpoint for UX flexibility
- **Uses normalized URL as DO key:** Same URL variants share cached results
- **Returns error in payload:** Not throwing - allows partial success handling
- **Leverages existing 24hr cache:** No additional caching needed

### 2. Update `createStory` Mutation

**Location:** `apps/worker/src/index.ts`

```typescript
// Current
createStory: mutation(standard(CreateStoryPayload))
  .input({
    url: standard(Schema.String),
    title: standard(Schema.String),
    tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
  })

// Updated - add description
createStory: mutation(standard(CreateStoryPayload))
  .input({
    url: standard(Schema.String),
    title: standard(Schema.String),
    description: standard(Schema.NullOr(Schema.String)),  // NEW
    tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
  })
  .resolve(async ({url, title, description, tagIds}) => {
    // ... existing auth check ...
    const story = await lib.createStory({url, title, description: description ?? undefined});
    // ... rest unchanged ...
  })
```

**Note:** The `Library.createStory()` method already accepts `description` - only the GraphQL mutation needs updating.

### 3. Error Handling in WebPageParser

The existing `fetchPageMetadata` function needs timeout handling:

**Location:** `apps/worker/src/features/web-page-parser/fetchPageMetadata.ts`

```typescript
export async function fetchPageMetadata(url: string) {
  const metadata: Record<string, string | null> = {};
  const rewriter = new HTMLRewriter()
    // ... existing handlers ...

  // Add timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some sites require User-Agent
        "User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await rewriter.transform(res).text();
    return Schema.decodeUnknownSync(PageMetadata)(metadata);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  }
}
```

---

## Frontend Design

### 1. New Component: `Textarea`

**Location:** `apps/kamp-us/src/design/Textarea.tsx`

Following the `Input` component pattern:

```typescript
import type {ComponentProps} from "react";
import styles from "./Textarea.module.css";

type TextareaProps = Omit<ComponentProps<"textarea">, "className">;

export function Textarea(props: TextareaProps) {
  return <textarea {...props} className={styles.Textarea} />;
}
```

**Location:** `apps/kamp-us/src/design/Textarea.module.css`

```css
.Textarea {
  /* Inherit Input styles via shared CSS variables */
  --input-border-default: var(--gray-a7);
  --input-border-focus: var(--sky-8);
  --input-bg-default: var(--gray-1);
  --input-text-default: var(--gray-12);
  --input-text-placeholder: var(--gray-9);
  --input-ring-focus: var(--sky-4);

  box-sizing: border-box;
  padding: var(--space-8) var(--space-12);
  border: 1px solid var(--input-border-default);
  border-radius: var(--radius-4);
  background-color: var(--input-bg-default);
  color: var(--input-text-default);
  font-family: inherit;
  font-size: var(--font-size-2);
  line-height: var(--line-height-2);
  outline: none;
  width: 100%;
  min-height: 80px;
  resize: vertical;

  &::placeholder {
    color: var(--input-text-placeholder);
  }

  &:focus {
    border-color: var(--input-border-focus);
    box-shadow: 0 0 0 2px var(--input-ring-focus);
  }
}
```

### 2. Update CreateStoryForm

**Location:** `apps/kamp-us/src/pages/Library.tsx`

#### State Changes (with Dirty State Tracking)

```typescript
function CreateStoryForm({...}) {
  const environment = useRelayEnvironment();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialTags);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Dirty state tracking - tracks user manual edits
  const [titleDirty, setTitleDirty] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  // Pending replacements - when dirty field has new fetched value waiting
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [pendingDescription, setPendingDescription] = useState<string | null>(null);

  // Debounce timer ref for auto-fetch on paste
  const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // ...
}
```

#### Auto-Fetch on Paste with Debounce

```typescript
// Helper to check if URL is valid
const isValidUrl = (urlString: string): boolean => {
  try {
    const parsed = new URL(urlString);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

// Handle URL change with auto-fetch on paste
const handleUrlChange = (newUrl: string) => {
  setUrl(newUrl);
  setFetchError(null);

  // Clear existing debounce timer
  if (fetchDebounceRef.current) {
    clearTimeout(fetchDebounceRef.current);
  }

  // Auto-fetch if valid URL (debounced)
  if (isValidUrl(newUrl)) {
    fetchDebounceRef.current = setTimeout(() => {
      handleFetchMetadata(newUrl);
    }, 500);
  }
};

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current);
    }
  };
}, []);
```

#### Fetch Handler with Dirty State Logic

```typescript
const handleFetchMetadata = async (urlToFetch?: string) => {
  const targetUrl = urlToFetch ?? url;
  if (!targetUrl || !isValidUrl(targetUrl)) return;

  setIsFetching(true);
  setFetchError(null);

  try {
    const result = await fetchQuery<LibraryFetchUrlMetadataQuery>(
      environment,
      FetchUrlMetadataQuery,
      {url: targetUrl},
    ).toPromise();

    if (result?.fetchUrlMetadata.error) {
      setFetchError(result.fetchUrlMetadata.error);
      return;
    }

    // Handle title - check dirty state
    if (result?.fetchUrlMetadata.title) {
      if (titleDirty) {
        // Field is dirty - show "Replace?" hint
        setPendingTitle(result.fetchUrlMetadata.title);
      } else {
        // Field is clean - overwrite directly
        setTitle(result.fetchUrlMetadata.title);
      }
    }

    // Handle description - check dirty state
    if (result?.fetchUrlMetadata.description) {
      if (descriptionDirty) {
        // Field is dirty - show "Replace?" hint
        setPendingDescription(result.fetchUrlMetadata.description);
      } else {
        // Field is clean - overwrite directly
        setDescription(result.fetchUrlMetadata.description);
      }
    }
  } catch {
    setFetchError("Failed to fetch metadata");
  } finally {
    setIsFetching(false);
  }
};

// Confirm replacement of dirty field
const confirmReplace = (field: "title" | "description") => {
  if (field === "title" && pendingTitle) {
    setTitle(pendingTitle);
    setPendingTitle(null);
    setTitleDirty(false);
  } else if (field === "description" && pendingDescription) {
    setDescription(pendingDescription);
    setPendingDescription(null);
    setDescriptionDirty(false);
  }
};

// Dismiss replacement hint
const dismissReplace = (field: "title" | "description") => {
  if (field === "title") {
    setPendingTitle(null);
  } else {
    setPendingDescription(null);
  }
};
```

#### Updated JSX (Field Order: URL → Title → Tags → Description)

```tsx
<Fieldset.Root>
  <Fieldset.Legend>Add Story</Fieldset.Legend>

  {/* URL Field with Fetch Button */}
  <Field
    label="URL"
    error={fetchError ?? undefined}
    control={
      <div className={styles.urlFieldContainer}>
        <Input
          type="url"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          required
          autoFocus
        />
        <Button
          type="button"
          onClick={() => handleFetchMetadata()}
          disabled={!isValidUrl(url) || isFetching}
        >
          {isFetching ? "Fetching..." : "Fetch"}
        </Button>
      </div>
    }
  />

  {/* Title Field with Replace Hint */}
  <Field
    label="Title"
    control={
      <div className={styles.fieldWithHint}>
        <Input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleDirty(true);
            setPendingTitle(null);
          }}
          required
        />
        {pendingTitle && (
          <button
            type="button"
            className={styles.replaceHint}
            onClick={() => confirmReplace("title")}
            onBlur={() => dismissReplace("title")}
          >
            Replace?
          </button>
        )}
      </div>
    }
  />

  {/* Tags Field (before Description) */}
  <Field
    label="Tags"
    control={
      <TagInput
        selectedTags={selectedTags}
        availableTags={availableTags}
        onChange={setSelectedTags}
        onCreate={handleCreateTag}
        placeholder="Add tags..."
      />
    }
  />

  {/* Description Field with Replace Hint */}
  <Field
    label="Description"
    control={
      <div className={styles.fieldWithHint}>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescriptionDirty(true);
            setPendingDescription(null);
          }}
          placeholder="Optional description..."
          rows={3}
        />
        {pendingDescription && (
          <button
            type="button"
            className={styles.replaceHint}
            onClick={() => confirmReplace("description")}
            onBlur={() => dismissReplace("description")}
          >
            Replace?
          </button>
        )}
      </div>
    }
  />
</Fieldset.Root>
```

#### CSS for URL Field Container

**Location:** `apps/kamp-us/src/pages/Library.module.css`

```css
.urlFieldContainer {
  display: flex;
  gap: var(--space-8);
  align-items: stretch;
}

.urlFieldContainer > input {
  flex: 1;
}

.fieldWithHint {
  position: relative;
}

.replaceHint {
  position: absolute;
  right: var(--space-8);
  top: 50%;
  transform: translateY(-50%);
  padding: var(--space-4) var(--space-8);
  background: var(--amber-3);
  border: 1px solid var(--amber-7);
  border-radius: var(--radius-2);
  color: var(--amber-11);
  font-size: var(--font-size-1);
  cursor: pointer;
  transition: background 0.15s ease;
}

.replaceHint:hover {
  background: var(--amber-4);
}

.replaceHint:focus {
  outline: 2px solid var(--amber-8);
  outline-offset: 2px;
}
```

### 3. Update StoryRow Edit Panel

The edit panel needs to include description field and fetch capability.

**Location:** `apps/kamp-us/src/pages/Library.tsx` (StoryRow component)

```typescript
// Add to StoryRow state
const [editDescription, setEditDescription] = useState("");
const [editDescriptionDirty, setEditDescriptionDirty] = useState(false);
const [pendingEditDescription, setPendingEditDescription] = useState<string | null>(null);
const [isEditFetching, setIsEditFetching] = useState(false);
const [editFetchError, setEditFetchError] = useState<string | null>(null);

// Initialize edit description when entering edit mode
const handleEdit = () => {
  setEditTitle(story.title);
  setEditDescription(story.description ?? "");
  setEditDescriptionDirty(false);
  setEditTags(story.tags.map((t) => ({id: t.id, name: t.name, color: t.color})));
  setIsEditing(true);
};

// Fetch handler for edit panel
const handleEditFetch = async () => {
  if (!story.url) return;
  setIsEditFetching(true);
  setEditFetchError(null);

  try {
    const result = await fetchQuery<LibraryFetchUrlMetadataQuery>(
      environment,
      FetchUrlMetadataQuery,
      {url: story.url},
    ).toPromise();

    if (result?.fetchUrlMetadata.error) {
      setEditFetchError(result.fetchUrlMetadata.error);
      return;
    }

    // Apply with dirty state logic (same as create form)
    // ...
  } catch {
    setEditFetchError("Failed to fetch metadata");
  } finally {
    setIsEditFetching(false);
  }
};
```

#### Edit Panel JSX

```tsx
{isEditing && (
  <article className={styles.storyRow}>
    {error && <div className={styles.rowError}>{error}</div>}
    <div className={styles.editRow}>
      {/* URL display with Fetch button */}
      <div className={styles.editUrlRow}>
        <span className={styles.editUrl}>{story.url}</span>
        <Button
          type="button"
          onClick={handleEditFetch}
          disabled={isEditFetching}
        >
          {isEditFetching ? "Fetching..." : "Fetch"}
        </Button>
      </div>

      {/* Title input */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className={styles.editInput}
        autoFocus
      />

      {/* Tags input */}
      <TagInput
        selectedTags={editTags}
        availableTags={availableTags}
        onChange={setEditTags}
        onCreate={handleCreateTag}
        placeholder="Add tags..."
      />

      {/* Description textarea */}
      <Textarea
        value={editDescription}
        onChange={(e) => {
          setEditDescription(e.target.value);
          setEditDescriptionDirty(true);
        }}
        placeholder="Optional description..."
        rows={3}
      />

      <div className={styles.editActions}>
        <Button type="button" onClick={handleCancelEdit} disabled={isUpdating}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSaveEdit} disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  </article>
)}
```

### 4. Description Hover on Story Rows

Stories display description on hover using a tooltip.

**Location:** `apps/kamp-us/src/pages/Library.tsx` (StoryRow component)

```tsx
// In the story display (non-editing) view
<article className={styles.storyRow}>
  <div className={styles.storyContent}>
    <div className={styles.storyMain}>
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.storyTitle}
        title={story.description ?? undefined}  // Native tooltip for now
      >
        {story.title}
      </a>
      {/* ... rest of story content */}
    </div>
  </div>
</article>
```

**Alternative: Custom Tooltip Component**

For better UX, consider using a proper tooltip component:

```tsx
import {Tooltip} from "../design/Tooltip";

<Tooltip content={story.description} delayMs={150}>
  <a href={story.url} className={styles.storyTitle}>
    {story.title}
  </a>
</Tooltip>
```

**Note:** If using native `title` attribute, the tooltip behavior is browser-controlled. For custom delay and styling, a Tooltip component would be needed (could be added to design system).

### 5. Update Mutation Call

```typescript
commitStory({
  variables: {
    url,
    title,
    description: description || null,  // NEW
    tagIds
  },
  // ... rest unchanged
});
```

### 4. Relay Environment Access

To use `fetchQuery`, the component needs access to the Relay environment. Options:

**Option A (Recommended):** Use `useRelayEnvironment` hook
```typescript
import {useRelayEnvironment} from "react-relay";

function CreateStoryForm({...}) {
  const environment = useRelayEnvironment();
  // ...
}
```

**Option B:** Create a custom hook that wraps the query
```typescript
// useFetchUrlMetadata.ts
export function useFetchUrlMetadata() {
  const environment = useRelayEnvironment();
  const [isLoading, setIsLoading] = useState(false);

  const fetchMetadata = async (url: string) => {
    setIsLoading(true);
    try {
      return await fetchQuery(environment, FetchUrlMetadataQuery, {url}).toPromise();
    } finally {
      setIsLoading(false);
    }
  };

  return {fetchMetadata, isLoading};
}
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/worker/src/index.ts` | Modify | Add `fetchUrlMetadata` query, add `description` to `createStory` |
| `apps/worker/src/features/web-page-parser/fetchPageMetadata.ts` | Modify | Add timeout and User-Agent header |
| `apps/kamp-us/src/design/Textarea.tsx` | Create | New textarea component |
| `apps/kamp-us/src/design/Textarea.module.css` | Create | Textarea styles |
| `apps/kamp-us/src/pages/Library.tsx` | Modify | Add fetch button, description field, auto-fetch, dirty state, edit panel description |
| `apps/kamp-us/src/pages/Library.module.css` | Modify | Add urlFieldContainer, fieldWithHint, replaceHint styles |

### Key Changes from Initial Design

| Aspect | Initial | Updated |
|--------|---------|---------|
| **Button text** | "Fetch Title" | "Fetch" |
| **Trigger** | Button click only | Auto-fetch on paste (500ms debounce) + button |
| **Overwrite** | Only empty fields | Always overwrite, unless dirty (show "Replace?" hint) |
| **Field order** | URL → Title → Description → Tags | URL → Title → Tags → Description |
| **Edit panel** | No description | Description + Fetch button |
| **Story list** | No description visible | Description on hover (tooltip) |

---

## Sequence Diagram

```
User                   Frontend                  GraphQL                WebPageParser DO
 │                        │                         │                         │
 │ 1. Enter URL           │                         │                         │
 │───────────────────────▶│                         │                         │
 │                        │                         │                         │
 │ 2. Click "Fetch Title" │                         │                         │
 │───────────────────────▶│                         │                         │
 │                        │                         │                         │
 │                        │ 3. fetchUrlMetadata     │                         │
 │                        │────────────────────────▶│                         │
 │                        │                         │                         │
 │                        │                         │ 4. Validate URL         │
 │                        │                         │ 5. Get DO stub          │
 │                        │                         │────────────────────────▶│
 │                        │                         │                         │
 │                        │                         │         6. init(url)    │
 │                        │                         │────────────────────────▶│
 │                        │                         │                         │
 │                        │                         │       7. getMetadata()  │
 │                        │                         │────────────────────────▶│
 │                        │                         │                         │
 │                        │                         │                         │ 8. Check cache
 │                        │                         │                         │ 9. If stale: fetch URL
 │                        │                         │                         │ 10. Parse HTML
 │                        │                         │                         │ 11. Cache result
 │                        │                         │                         │
 │                        │                         │◀────────────────────────│
 │                        │                         │    {title, description} │
 │                        │◀────────────────────────│                         │
 │                        │  {title, description}   │                         │
 │                        │                         │                         │
 │                        │ 12. Populate empty      │                         │
 │                        │     fields              │                         │
 │◀───────────────────────│                         │                         │
 │   Title/Desc filled    │                         │                         │
 │                        │                         │                         │
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| **SSRF attacks** | Only allow http/https protocols |
| **Infinite redirects** | Cloudflare Workers limit redirects by default |
| **Slow/hanging requests** | 10 second timeout with AbortController |
| **Resource exhaustion** | HTMLRewriter streams response, minimal memory |
| **XSS from fetched content** | React auto-escapes; content displayed as text |
| **Abuse for scraping** | Cloudflare rate limiting if needed |

---

## Testing Strategy

### Backend Tests
```typescript
// apps/worker/test/fetch-url-metadata.spec.ts
describe("fetchUrlMetadata query", () => {
  it("returns title and description for valid URL");
  it("returns error for invalid URL format");
  it("returns error for non-http protocols");
  it("returns cached result on subsequent calls");
  it("handles timeout gracefully");
  it("handles unreachable sites gracefully");
});
```

### Frontend Tests
- Manual testing of form flow
- Verify fetch button states (disabled, loading, error)
- Verify only empty fields are populated
- Verify form submission with description

---

## Open Questions Resolved

1. **Should description be added to createStory?** → Yes, backend already supports it
2. **How to handle caching?** → WebPageParser already has 24hr cache
3. **Authentication required?** → No, public endpoint
4. **Where to put fetch logic?** → In CreateStoryForm using `fetchQuery`

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Some sites block scraping | Low - user can enter manually | Graceful error message |
| Slow external sites | Medium - poor UX | 10s timeout, loading state |
| Rate limiting by target sites | Low | Per-URL caching reduces requests |
| Cache invalidation | Low | 24hr TTL is reasonable; can add forceFetch later |
