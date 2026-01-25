# Technical Design

Derived from [requirements.md](./requirements.md)

## Architecture

Two distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    RETRIEVAL (Effectful)                    │
├─────────────────────────────────────────────────────────────┤
│  fetchHtml(url: string): Effect<string, FetchError>         │
│    - HTTP fetch with timeout                                │
│    - URL validation                                         │
│    - Error mapping                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ html: string
┌─────────────────────────────────────────────────────────────┐
│                    EXTRACTION (Pure)                        │
├─────────────────────────────────────────────────────────────┤
│  extractPage(html: string, baseUrl: string): ExtractedPage  │
│    - linkedom parseHTML                                     │
│    - extractMetadata(doc)                                   │
│    - extractContent(doc) with strategy chain                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              { metadata, content, strategy }
```

**Benefits:**
- Extraction testable with HTML fixtures (no network mocking)
- Retrieval reusable for other purposes
- Clear error boundaries (fetch errors vs parse errors)

## Module Design

### 1. fetchHtml.ts

```typescript
import {HttpClient, HttpClientRequest} from "@effect/platform"
import {Duration, Effect} from "effect"
import {FetchHttpError, FetchNetworkError, FetchTimeoutError, InvalidProtocolError} from "@kampus/web-page-parser"

const validateUrl = (url: string) =>
  Effect.try({
    try: () => {
      const parsed = new URL(url)
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw parsed.protocol
      }
      return parsed
    },
    catch: (e) => new InvalidProtocolError({url, protocol: String(e)}),
  })

export const fetchHtml = (url: string) =>
  Effect.gen(function* () {
    yield* validateUrl(url)

    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders({
        "User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      }),
    )

    const response = yield* client.execute(request).pipe(
      Effect.timeout(Duration.seconds(15)),
      Effect.catchTag("TimeoutException", () => Effect.fail(new FetchTimeoutError({url}))),
      Effect.catchTag("RequestError", (e) => Effect.fail(new FetchNetworkError({url, message: e.message}))),
      Effect.catchTag("ResponseError", (e) => Effect.fail(new FetchHttpError({url, status: e.response.status}))),
    )

    return yield* response.text.pipe(
      Effect.catchTag("ResponseError", () =>
        Effect.fail(new FetchNetworkError({url, message: "Failed to read body"})),
      ),
    )
  })
```

### 2. extractMetadata.ts

```typescript
import type {PageMetadata} from "@kampus/web-page-parser"

export const extractMetadata = (doc: Document): PageMetadata => {
  const getMetaContent = (selectors: string[]): string | null => {
    for (const sel of selectors) {
      const el = doc.querySelector(sel)
      const content = el?.getAttribute?.("content") ?? el?.textContent
      if (content?.trim()) return content.trim()
    }
    return null
  }

  // title is required in PageMetadata schema, fallback to "Untitled"
  const title = getMetaContent([
    'meta[property="og:title"]',
    'title',
  ]) ?? "Untitled"

  return {
    title,
    description: getMetaContent([
      'meta[property="og:description"]',
      'meta[name="description"]',
    ]),
  }
}
```

### 3. extractContent.ts

```typescript
import type {ReaderContent} from "@kampus/web-page-parser"
import {isProbablyReaderable, Readability} from "@mozilla/readability"

const IMAGE_PROXY_BASE = "/api/proxy-image?url="

type ContentResult = {
  content: ReaderContent | null
  strategy: "readability" | "selector" | null
}

type ExtractionOptions = {
  selectors?: string[]
  minContentLength?: number
}

const DEFAULT_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  ".post-content",
  ".entry-content",
  ".article-content",
  "#content",
]

const MIN_CONTENT_LENGTH = 500

// Preserve newlines in code blocks (existing logic)
const preserveCodeBlockNewlines = (doc: Document): void => {
  for (const pre of doc.querySelectorAll("pre")) {
    const code = pre.querySelector("code")
    const target = code || pre
    const children = Array.from(target.childNodes)
    if (children.length > 1 && children.some((n) => n.nodeType === 1)) {
      const lines: string[] = []
      for (const child of children) {
        const text = child.textContent?.trimEnd() ?? ""
        if (text || lines.length > 0) lines.push(text)
      }
      target.textContent = lines.join("\n")
    }
  }
}

const rewriteImageUrls = (html: string, baseUrl: string): string => {
  // Use regex for simple rewrite without re-parsing
  return html.replace(
    /<img([^>]*?)src=["']([^"']+)["']/gi,
    (match, before, src) => {
      const absoluteUrl = new URL(src, baseUrl).href
      return `<img${before}src="${IMAGE_PROXY_BASE}${encodeURIComponent(absoluteUrl)}"`
    },
  )
}

const calculateStats = (text: string) => {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return {wordCount, readingTimeMinutes: Math.ceil(wordCount / 200)}
}

const tryReadability = (doc: Document, url: string): ReaderContent | null => {
  if (!isProbablyReaderable(doc)) return null

  preserveCodeBlockNewlines(doc)

  const article = new Readability(doc.cloneNode(true) as Document, {
    charThreshold: 100,
    keepClasses: true,
  }).parse()

  if (!article?.content || !article?.textContent || !article?.title) {
    return null
  }

  const {wordCount, readingTimeMinutes} = calculateStats(article.textContent)

  return {
    title: article.title,
    content: rewriteImageUrls(article.content, url),
    textContent: article.textContent,
    excerpt: article.excerpt ?? null,
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    wordCount,
    readingTimeMinutes,
  }
}

const trySelectors = (
  doc: Document,
  url: string,
  options: ExtractionOptions = {},
): ReaderContent | null => {
  const selectors = [...DEFAULT_SELECTORS, ...(options.selectors ?? [])]
  const minLength = options.minContentLength ?? MIN_CONTENT_LENGTH

  for (const selector of selectors) {
    const el = doc.querySelector(selector)
    if (!el) continue

    const textContent = el.textContent?.trim() ?? ""
    if (textContent.length < minLength) continue

    const content = el.innerHTML
    const {wordCount, readingTimeMinutes} = calculateStats(textContent)
    const title = doc.querySelector("title")?.textContent ?? null

    return {
      title: title ?? "Untitled",
      content: rewriteImageUrls(content, url),
      textContent,
      excerpt: textContent.slice(0, 200),
      byline: null,
      siteName: null,
      wordCount,
      readingTimeMinutes,
    }
  }

  return null
}

export const extractContent = (
  doc: Document,
  url: string,
  options: ExtractionOptions = {},
): ContentResult => {
  // Try Readability first
  const readabilityResult = tryReadability(doc, url)
  if (readabilityResult) {
    return {content: readabilityResult, strategy: "readability"}
  }

  // Fallback to selector-based
  const selectorResult = trySelectors(doc, url, options)
  if (selectorResult) {
    return {content: selectorResult, strategy: "selector"}
  }

  return {content: null, strategy: null}
}
```

### 4. extractPage.ts (Pure - no Effect)

```typescript
import type {PageMetadata, ReaderContent} from "@kampus/web-page-parser"
import {parseHTML} from "linkedom/worker"
import {extractMetadata} from "./extractMetadata"
import {extractContent} from "./extractContent"

export type ExtractedPage = {
  metadata: PageMetadata
  content: ReaderContent | null
  strategy: "readability" | "selector" | null
}

/**
 * Pure extraction function - takes HTML string, returns extracted data.
 * No network, no effects - fully testable with fixtures.
 *
 * @param html - Raw HTML string
 * @param baseUrl - Used for resolving relative URLs (images, links)
 */
export const extractPage = (html: string, baseUrl: string): ExtractedPage => {
  const {document} = parseHTML(html)

  const metadata = extractMetadata(document)
  const {content, strategy} = extractContent(document, baseUrl)

  return {metadata, content, strategy}
}
```

**Note:** `parseHTML` from linkedom can throw on malformed HTML. Handlers wrap this in Effect.try for error handling.

### 5. Updated handlers.ts

```typescript
import {FetchHttpClient} from "@effect/platform"
import {Effect} from "effect"
import {ParseError} from "@kampus/web-page-parser"
import {fetchHtml} from "./fetchHtml"
import {extractPage} from "./extractPage"

// Compose fetch + extract into an Effect
const fetchAndExtract = (url: string) =>
  Effect.gen(function* () {
    const html = yield* fetchHtml(url)

    // Wrap pure extraction in Effect.try to catch parse errors
    return yield* Effect.try({
      try: () => extractPage(html, url),
      catch: (e) => new ParseError({url, message: String(e)}),
    })
  })

export const handlers = {
  init: ({url}: {url: string}) =>
    Effect.gen(function* () {
      const ctx = yield* DurableObjectCtx
      yield* Effect.promise(() => ctx.storage.put("url", url))
    }),

  getMetadata: ({forceFetch}: {forceFetch?: boolean}) =>
    Effect.gen(function* () {
      const url = yield* getStoredUrl()

      if (!forceFetch) {
        const cached = yield* getCachedMetadata()
        if (cached) return cached
      }

      // Fetch + extract, then return just metadata
      const extracted = yield* fetchAndExtract(url).pipe(
        Effect.provide(FetchHttpClient.layer),
      )
      yield* cacheExtracted(extracted)

      return extracted.metadata
    }).pipe(Effect.orDie),

  getReaderContent: ({forceFetch}: {forceFetch?: boolean}) =>
    Effect.gen(function* () {
      const url = yield* getStoredUrl()

      if (!forceFetch) {
        const cached = yield* getCachedReaderResult()
        if (cached) return cached
      }

      const result = yield* fetchAndExtract(url).pipe(
        Effect.map((extracted): ReaderResult => ({
          readable: extracted.content !== null,
          metadata: extracted.metadata,
          content: extracted.content,
          strategy: extracted.strategy,
          error: extracted.content ? null : "No content could be extracted",
        })),
        Effect.catchAll((error) =>
          Effect.succeed(errorToReaderResult(error)),
        ),
        Effect.provide(FetchHttpClient.layer),
      )

      yield* cacheReaderResult(result)
      return result
    }).pipe(Effect.orDie),
}
```

**Key patterns:**
- `fetchAndExtract` composes the effectful fetch with pure extraction, keeping them separable for testing
- `Effect.orDie` converts errors to defects → RPC layer catches and returns generic error response
- `getReaderContent` handles errors explicitly via `catchAll` → converts to `ReaderResult` with error field

## Schema Updates

### packages/web-page-parser/src/schema.ts

```typescript
import {Schema} from "effect"

// NOTE: title is required (existing behavior), description is nullable
export const PageMetadata = Schema.Struct({
  title: Schema.String,  // required - fallback to "Untitled" if not found
  description: Schema.NullOr(Schema.String),
})
export type PageMetadata = typeof PageMetadata.Type

export const ReaderContent = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  textContent: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  byline: Schema.NullOr(Schema.String),
  siteName: Schema.NullOr(Schema.String),
  wordCount: Schema.Number,
  readingTimeMinutes: Schema.Number,
})
export type ReaderContent = typeof ReaderContent.Type

export const ExtractionStrategy = Schema.NullOr(
  Schema.Literal("readability", "selector")
)
export type ExtractionStrategy = typeof ExtractionStrategy.Type

// Updated ReaderResult
export const ReaderResult = Schema.Struct({
  readable: Schema.Boolean,
  metadata: Schema.NullOr(PageMetadata),  // NEW: null when fetch fails
  content: Schema.NullOr(ReaderContent),
  strategy: ExtractionStrategy,  // NEW
  error: Schema.NullOr(Schema.String),
})
export type ReaderResult = typeof ReaderResult.Type
```

## Database Schema Updates

### drizzle.schema.ts changes

```typescript
// Add strategy column to reader_content table
// NOTE: table is "reader_content", columns use snake_case
export const readerContent = sqliteTable("reader_content", {
  id: text("id").primaryKey().$defaultFn(() => id("wbp_read")),
  readable: integer("readable").notNull().default(0),
  strategy: text("strategy"),  // NEW: 'readability' | 'selector' | null
  title: text("title"),
  content: text("content"),
  textContent: text("text_content"),
  excerpt: text("excerpt"),
  byline: text("byline"),
  siteName: text("site_name"),
  wordCount: integer("word_count"),
  readingTimeMinutes: integer("reading_time_minutes"),
  // Add metadata fields for caching
  metaTitle: text("meta_title"),  // NEW
  metaDescription: text("meta_description"),  // NEW
  error: text("error"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
})
```

### Migration

Use drizzle-kit to generate migration after schema changes:
```bash
pnpm drizzle-kit generate
```

## Error Handling

Remove `NotReadableError` - no longer needed since selector fallback handles the "not readable" case.

Error mapping in handlers:
```typescript
const errorToReaderResult = (error: ParseError | FetchTimeoutError | ...): ReaderResult => ({
  readable: false,
  metadata: null,  // null when fetch/parse fails - we have nothing to extract
  content: null,
  strategy: null,
  error: Match.value(error).pipe(
    Match.tag("FetchTimeoutError", () => "Request timed out"),
    Match.tag("FetchHttpError", (e) => `HTTP ${e.status}`),
    Match.tag("FetchNetworkError", (e) => e.message),
    Match.tag("ParseError", (e) => e.message),
    Match.tag("InvalidProtocolError", (e) => `Invalid protocol: ${e.protocol}`),
    Match.exhaustive,
  ),
})
```

## File Structure

```
apps/worker/src/features/web-page-parser/
├── WebPageParser.ts          # DO definition (unchanged)
├── handlers.ts               # Updated: composes fetch + extract
├── fetchHtml.ts              # NEW: Effect-based HTML retrieval
├── extractPage.ts            # NEW: pure extraction entry point
├── extractMetadata.ts        # NEW: pure metadata extraction
├── extractContent.ts         # NEW: pure content extraction with strategies
├── proxyImage.ts             # Unchanged
├── drizzle/
│   ├── drizzle.schema.ts     # Updated for new fields
│   └── migrations/

# DELETED:
# - fetchPageMetadata.ts (replaced by extractPage)
# - fetchReaderContent.ts (replaced by fetchHtml + extractPage)
```

## Testing Strategy

**Key benefit of separation:** Extraction is pure → test with HTML fixtures, no mocking needed.

1. **Unit tests for extraction (pure):**
   - `extractMetadata(doc)` - various HTML fixtures
   - `extractContent(doc, url)` - Readability-friendly and non-friendly HTML
   - `extractPage(html, url)` - end-to-end extraction

2. **Unit tests for retrieval:**
   - `fetchHtml(url)` - mock HttpClient service

3. **Integration tests:**
   - `fetchAndExtract` composition with mocked HTTP

4. **E2E verification:**
   - Test against real URLs that previously failed
   - Verify backward compatibility of RPC interface
