# Requirements

Derived from [instructions.md](./instructions.md) | RFC: #30

## Functional Requirements

### FR-1: Unified Fetching
- Single HTTP fetch using Effect HttpClient
- 15-second timeout
- User-Agent header for bot identification
- URL validation (http/https only)

### FR-2: Unified Parsing
- Single DOM parse using linkedom
- Parse once, extract both metadata and content from same Document

### FR-3: Metadata Extraction
- Always extract metadata regardless of content extraction result
- Extract: title (og:title > title tag), description (og:description > meta description)
- Pure function, no Effect wrapper needed

### FR-4: Content Extraction Strategy Chain
- **Primary**: Readability extraction
  - Use `isProbablyReaderable()` check
  - `charThreshold: 100`, `keepClasses: true`
  - Preserve code block newlines (existing logic)
- **Fallback**: Selector-based extraction
  - Try selectors in order: `article`, `main`, `[role="main"]`, `.post-content`, `.entry-content`, `.article-content`, `#content`
  - Min content length: 500 chars
  - Configurable selectors (merge with defaults)

### FR-5: Return Type Changes
- `ReaderResult` must always include `metadata` field
- Add `strategy: 'readability' | 'selector' | null` field
- `readable: true` when content extracted by either strategy
- `content: null` only when both strategies fail

### FR-6: Image Proxy
- Apply image URL rewriting to all extracted content
- Same treatment regardless of extraction strategy

### FR-7: Caching
- Maintain 24h TTL for cached results
- Cache stores both metadata and content
- `forceFetch` bypasses cache

### FR-8: Backward Compatibility
- `getMetadata()` RPC continues to work
- `getReaderContent()` RPC continues to work
- Existing consumers unaffected

## Non-Functional Requirements

### NFR-1: Cloudflare Workers Compatibility
- All code must run in Workers environment
- Use linkedom/worker import path

### NFR-2: Code Organization
- New files: `fetchHtml.ts`, `extractMetadata.ts`, `extractContent.ts`, `parseWebPage.ts`
- Delete: `fetchPageMetadata.ts`, `fetchReaderContent.ts`
- Remove HTMLRewriter usage

### NFR-3: Error Handling
- Single error field for failures (simple approach)
- Domain errors: `FetchTimeoutError`, `FetchHttpError`, `FetchNetworkError`, `InvalidProtocolError`, `ParseError`
- Remove `NotReadableError` (fallback handles this case now)

## Schema Changes

### Current ReaderResult
```typescript
{
  readable: boolean
  content: ReaderContent | null
  error: string | null
}
```

### New ReaderResult
```typescript
{
  readable: boolean
  metadata: PageMetadata        // NEW: always present
  content: ReaderContent | null
  strategy: 'readability' | 'selector' | null  // NEW
  error: string | null
}
```

## Files Affected

| File | Action |
|------|--------|
| `packages/web-page-parser/src/schema.ts` | Update ReaderResult schema |
| `apps/worker/.../fetchHtml.ts` | Create |
| `apps/worker/.../extractMetadata.ts` | Create |
| `apps/worker/.../extractContent.ts` | Create |
| `apps/worker/.../parseWebPage.ts` | Create |
| `apps/worker/.../handlers.ts` | Update to use new pipeline |
| `apps/worker/.../fetchPageMetadata.ts` | Delete |
| `apps/worker/.../fetchReaderContent.ts` | Delete |
| `apps/worker/.../drizzle/drizzle.schema.ts` | Update for new fields |
