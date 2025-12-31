# Implementation Plan: Fetch Title from URL

**Status:** Phase 4 - Implementation Roadmap (Updated with UX Improvements)
**Source:** [design.md](./design.md)

## Implementation Sequence

The implementation follows a **backend-first** approach to ensure the frontend has a working API to integrate with.

```
Phase A: Backend (worker) ✅ COMPLETE
    │
    ├─► A1: Add timeout to fetchPageMetadata ✅
    ├─► A2: Add fetchUrlMetadata GraphQL query ✅
    └─► A3: Add description to createStory mutation ✅
            │
            ▼
Phase B: Frontend Design System (kamp-us) ✅ COMPLETE
    │
    └─► B1: Create Textarea component ✅
            │
            ▼
Phase C: Frontend Form - UX Improvements (kamp-us)
    │
    ├─► C1: Rename button "Fetch Title" → "Fetch"
    ├─► C2: Add dirty state tracking with "Replace?" hint
    ├─► C3: Add auto-fetch on paste (500ms debounce)
    ├─► C4: Reorder fields: URL → Title → Tags → Description
    ├─► C5: Add description field to edit panel
    └─► C6: Add description hover/tooltip on story rows
            │
            ▼
Phase D: Verification
    │
    ├─► D1: Regenerate Relay artifacts
    ├─► D2: Type check worker
    ├─► D3: Manual testing
    └─► D4: Biome check (staged files only)
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

### Phase C: Frontend Form - UX Improvements

#### C1: Rename button "Fetch Title" → "Fetch"
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
- Change button text from "Fetch Title" to "Fetch"
- The button fetches both title and description, so "Fetch" is more honest

---

#### C2: Add dirty state tracking with "Replace?" hint
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
1. Add `titleDirty` and `descriptionDirty` state
2. Add `pendingTitle` and `pendingDescription` state for waiting replacements
3. Mark fields dirty when user manually edits them
4. On fetch: if field is dirty, show "Replace?" hint instead of overwriting
5. Add `confirmReplace()` and `dismissReplace()` handlers
6. Fetched values do NOT mark fields as dirty

**File:** `apps/kamp-us/src/pages/Library.module.css`

**Add:**
```css
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
}
```

---

#### C3: Add auto-fetch on paste (500ms debounce)
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
1. Add `useRef` for debounce timer
2. Create `handleUrlChange()` that sets URL and triggers debounced fetch
3. Validate URL before triggering auto-fetch
4. Clear debounce timer on unmount via `useEffect` cleanup
5. Manual "Fetch" button remains as fallback

---

#### C4: Reorder fields: URL → Title → Tags → Description
**File:** `apps/kamp-us/src/pages/Library.tsx`

**Changes:**
- Move Description field after Tags field in JSX
- Tags require user thought after auto-fetch; description is "nice to have"

---

#### C5: Add description field to edit panel
**File:** `apps/kamp-us/src/pages/Library.tsx` (StoryRow component)

**Changes:**
1. Add `editDescription` and `editDescriptionDirty` state
2. Initialize description when entering edit mode
3. Add Textarea for description in edit panel JSX
4. Add "Fetch" button to edit panel for re-fetching metadata
5. Include description in save mutation

---

#### C6: Add description hover/tooltip on story rows
**File:** `apps/kamp-us/src/pages/Library.tsx` (StoryRow component)

**Changes:**
- Add `title={story.description}` attribute to story link for native tooltip
- Only show tooltip if description exists

**Note:** Native `title` attribute is simplest; custom Tooltip component can be added later if better UX needed.

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
- [ ] Enter valid URL → auto-fetch triggers after 500ms, title/description populate
- [ ] Click "Fetch" button → same result as auto-fetch
- [ ] Edit title manually, then fetch → "Replace?" hint appears
- [ ] Click "Replace?" → field updates with fetched value
- [ ] Click elsewhere → "Replace?" dismissed, user value kept
- [ ] Verify field order is URL → Title → Tags → Description
- [ ] Edit a story → description field visible and editable
- [ ] Hover over story in list → description tooltip appears
- [ ] Submit story with description → saved correctly

#### D4: Biome check (changed files only)
```bash
biome check --write --staged
```

---

## Implementation Checklist

### Phase A: Backend ✅ COMPLETE
- [x] A1: Add timeout to fetchPageMetadata
- [x] A2: Add fetchUrlMetadata GraphQL query
- [x] A3: Add description to createStory mutation

### Phase B: Design System ✅ COMPLETE
- [x] B1: Create Textarea.tsx
- [x] B1: Create Textarea.module.css

### Phase C: Frontend Form - UX Improvements
- [ ] C1: Rename button to "Fetch"
- [ ] C2: Add dirty state tracking with "Replace?" hint
- [ ] C3: Add auto-fetch on paste (500ms debounce)
- [ ] C4: Reorder fields URL → Title → Tags → Description
- [ ] C5: Add description to edit panel
- [ ] C6: Add description hover on story rows

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
