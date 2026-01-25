# Implementation Plan

Derived from [design.md](./design.md)

## Implementation Order

Work is ordered by dependency - each step builds on the previous.

### Step 1: Schema Updates

**Files:** `packages/web-page-parser/src/schema.ts`

1. Add `ExtractionStrategy` schema
2. Update `ReaderResult` to include `metadata` (nullable) and `strategy` fields
3. Export new types

**Verify:** `pnpm turbo run typecheck`

---

### Step 2: Database Schema

**Files:** `apps/worker/src/features/web-page-parser/drizzle/drizzle.schema.ts`

1. Add `strategy` column to `reader_content` table
2. Add `meta_title` and `meta_description` columns
3. Generate migration: `pnpm drizzle-kit generate`

**Verify:** Check generated migration SQL looks correct

---

### Step 3: Pure Extraction Functions

**Files (create):**
- `apps/worker/src/features/web-page-parser/extractMetadata.ts`
- `apps/worker/src/features/web-page-parser/extractContent.ts`
- `apps/worker/src/features/web-page-parser/extractPage.ts`

**extractMetadata.ts:**
- Pure function: `(doc: Document) => PageMetadata`
- Extract title (og:title > title tag), description (og:description > meta description)
- Fallback title to "Untitled"

**extractContent.ts:**
- Pure function: `(doc: Document, baseUrl: string, options?) => ContentResult`
- `tryReadability()` - existing logic with `isProbablyReaderable`, `preserveCodeBlockNewlines`
- `trySelectorExtraction()` - fallback with configurable selectors, 500 char min
- Image proxy rewriting for both strategies

**extractPage.ts:**
- Pure function: `(html: string, baseUrl: string) => ExtractedPage`
- Compose: `parseHTML` → `extractMetadata` + `extractContent`

**Verify:** Write unit tests with HTML fixtures

---

### Step 4: Retrieval Function

**Files (create):**
- `apps/worker/src/features/web-page-parser/fetchHtml.ts`

**fetchHtml.ts:**
- Effect function: `(url: string) => Effect<string, FetchError, HttpClient>`
- URL validation (http/https)
- 15s timeout
- Error mapping to domain errors

**Verify:** Existing `proxyImage.ts` uses same pattern - can reference

---

### Step 5: Update Handlers

**Files:** `apps/worker/src/features/web-page-parser/handlers.ts`

1. Add `fetchAndExtract` composition helper
2. Update `getMetadata` to use `fetchAndExtract`, return `metadata`
3. Update `getReaderContent` to use `fetchAndExtract`, map to `ReaderResult`
4. Update cache helpers for new schema fields
5. Update `mapDbRowToReaderResult` and `mapReaderResultToDbRow` for new fields

**Verify:** `pnpm turbo run typecheck`

---

### Step 6: Delete Old Files

**Files (delete):**
- `apps/worker/src/features/web-page-parser/fetchPageMetadata.ts`
- `apps/worker/src/features/web-page-parser/fetchReaderContent.ts`

**Verify:** No import errors, typecheck passes

---

### Step 7: Remove NotReadableError

**Files:** `packages/web-page-parser/src/errors.ts`, `packages/web-page-parser/src/index.ts`

1. Remove `NotReadableError` class (no longer needed - fallback handles this)
2. Remove export from index.ts

**Verify:** `pnpm turbo run typecheck` - ensure nothing references it

---

### Step 8: End-to-End Testing

1. Run local worker: `pnpm turbo run dev --filter=worker`
2. Test with URLs that previously failed Readability
3. Verify `strategy` field returns correct value
4. Verify `metadata` always present when fetch succeeds
5. Verify backward compatibility - existing consumers work

---

## Verification Checklist

- [ ] `pnpm turbo run typecheck` passes
- [ ] `pnpm turbo run build` passes
- [ ] Local worker runs without errors
- [ ] Readability-friendly URL returns `strategy: "readability"`
- [ ] Non-readable URL returns `strategy: "selector"` (if content found)
- [ ] Fetch error returns `metadata: null, error: "..."`
- [ ] Successful parse returns `metadata: {...}` even if no content
