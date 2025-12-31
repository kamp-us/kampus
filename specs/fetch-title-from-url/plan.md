# Implementation Plan: Fetch Title from URL

**Status:** Phase 4 - Implementation Roadmap
**Source:** [design.md](./design.md)

## Implementation Sequence

The implementation follows a **backend-first** approach to ensure the frontend has a working API to integrate with.

```
Phase A: Backend (worker)
    │
    ├─► A1: Add timeout to fetchPageMetadata
    ├─► A2: Add fetchUrlMetadata GraphQL query
    └─► A3: Add description to createStory mutation
            │
            ▼
Phase B: Frontend Design System (kamp-us)
    │
    └─► B1: Create Textarea component
            │
            ▼
Phase C: Frontend Form (kamp-us)
    │
    ├─► C1: Add description state and field
    ├─► C2: Add fetch button with loading/error states
    └─► C3: Update createStory mutation call
            │
            ▼
Phase D: Verification
    │
    ├─► D1: Regenerate Relay artifacts
    ├─► D2: Type check worker
    ├─► D3: Manual testing
    └─► D4: Biome check
```

---

## Task Breakdown

### Phase A: Backend Changes

#### A1: Add timeout and User-Agent to fetchPageMetadata
**File:** `apps/worker/src/features/web-page-parser/fetchPageMetadata.ts`

**Changes:**
- Add AbortController with 10s timeout
- Add User-Agent header for sites that require it
- Handle AbortError with descriptive message

**Code:**
```typescript
export async function fetchPageMetadata(url: string) {
  const metadata: Record<string, string | null> = {};
  const rewriter = new HTMLRewriter()
    // ... existing handlers unchanged ...

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
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

#### A2: Add fetchUrlMetadata GraphQL query
**File:** `apps/worker/src/index.ts`

**Changes:**
1. Import `getNormalizedUrl` from library feature
2. Add `UrlMetadata` schema definition
3. Add `urlMetadataResolver` with `fetchUrlMetadata` query
4. Include resolver in `weave()` call

**Code additions:**

```typescript
// Near top - add import
import {getNormalizedUrl} from "./features/library/getNormalizedUrl";

// After other schema definitions
const UrlMetadata = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
}).annotations({title: "UrlMetadata"});

// New resolver
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

      // Only allow http/https
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {title: null, description: null, error: "Only HTTP/HTTPS URLs are allowed"};
      }

      try {
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

// Update weave() call to include urlMetadataResolver
```

---

#### A3: Add description to createStory mutation
**File:** `apps/worker/src/index.ts`

**Changes:**
1. Add `description` to mutation input schema
2. Pass description to `lib.createStory()`

**Before:**
```typescript
createStory: mutation(standard(CreateStoryPayload))
  .input({
    url: standard(Schema.String),
    title: standard(Schema.String),
    tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
  })
  .resolve(async ({url, title, tagIds}) => {
    // ...
    const story = await lib.createStory({url, title});
```

**After:**
```typescript
createStory: mutation(standard(CreateStoryPayload))
  .input({
    url: standard(Schema.String),
    title: standard(Schema.String),
    description: standard(Schema.NullOr(Schema.String)),
    tagIds: standard(Schema.NullOr(Schema.Array(Schema.String))),
  })
  .resolve(async ({url, title, description, tagIds}) => {
    // ...
    const story = await lib.createStory({url, title, description: description ?? undefined});
```

---

### Phase B: Frontend Design System

#### B1: Create Textarea component
**Files:**
- `apps/kamp-us/src/design/Textarea.tsx` (create)
- `apps/kamp-us/src/design/Textarea.module.css` (create)

**Textarea.tsx:**
```typescript
import type {ComponentProps} from "react";
import styles from "./Textarea.module.css";

type TextareaProps = Omit<ComponentProps<"textarea">, "className">;

export function Textarea(props: TextareaProps) {
  return <textarea {...props} className={styles.Textarea} />;
}
```

**Textarea.module.css:**
```css
.Textarea {
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

---

### Phase C: Frontend Form Updates

#### C1: Add description state and field
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
1. Import `Textarea` component
2. Add `description` state
3. Add description field to form
4. Reset description on cancel/submit

---

#### C2: Add fetch button with loading/error states
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
1. Add GraphQL query for `fetchUrlMetadata`
2. Import `fetchQuery` and `useRelayEnvironment` from react-relay
3. Add `isFetching` and `fetchError` state
4. Add `handleFetchMetadata` function
5. Update URL field with fetch button
6. Add CSS for URL field container

**File:** `apps/kamp-us/src/pages/Library.module.css`

**Add:**
```css
.urlFieldContainer {
  display: flex;
  gap: var(--space-8);
  align-items: stretch;
}

.urlFieldContainer > input {
  flex: 1;
}
```

---

#### C3: Update createStory mutation call
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
1. Update `CreateStoryMutation` to include description variable
2. Pass description in mutation variables

---

### Phase D: Verification

#### D1: Regenerate Relay artifacts
```bash
pnpm --filter kamp-us run schema:fetch
pnpm --filter kamp-us run relay
```

#### D2: Type check worker
```bash
pnpm --filter worker exec tsc --noEmit
```

#### D3: Manual testing
- [ ] Enter valid URL, click Fetch Title → title/description populate
- [ ] Enter URL with existing title → title NOT overwritten
- [ ] Enter invalid URL → error message displayed
- [ ] Test timeout with slow/unresponsive URL
- [ ] Submit story with description → saved correctly
- [ ] Verify description appears (if displayed in UI)

#### D4: Biome check (changed files only)
```bash
biome check --write --staged
```

---

## Implementation Checklist

### Phase A: Backend
- [ ] A1: Add timeout to fetchPageMetadata
- [ ] A2: Add fetchUrlMetadata GraphQL query
- [ ] A3: Add description to createStory mutation
- [ ] A-verify: `pnpm --filter worker exec tsc --noEmit`

### Phase B: Design System
- [ ] B1: Create Textarea.tsx
- [ ] B1: Create Textarea.module.css

### Phase C: Frontend Form
- [ ] C1: Add description state and field
- [ ] C2: Add fetch button UI
- [ ] C2: Add fetch handler logic
- [ ] C2: Add urlFieldContainer CSS
- [ ] C3: Update mutation to include description

### Phase D: Verification
- [ ] D1: Fetch GraphQL schema
- [ ] D1: Compile Relay artifacts
- [ ] D2: Type check worker
- [ ] D3: Manual testing
- [ ] D4: Biome format/lint

---

## Risk Mitigation During Implementation

| Risk | Mitigation |
|------|------------|
| GraphQL schema drift | Fetch schema immediately after backend changes |
| Type errors in Relay | Run relay compiler before editing frontend |
| CSS variable mismatches | Copy exact variables from Input.module.css |
| Forgotten cleanup | Reset description in handleCancel and handleSubmit |

---

## Definition of Done

- [ ] User can click "Fetch Title" to auto-populate title and description
- [ ] Only empty fields are populated (user input preserved)
- [ ] Loading state shown during fetch
- [ ] Error state shown on failure
- [ ] Description saved with story on submit
- [ ] No TypeScript errors
- [ ] No Biome errors
- [ ] All manual test cases pass
