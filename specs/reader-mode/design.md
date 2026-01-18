# Reader Mode - Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Worker (Hono)                          │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ /api/proxy-image│  │ GraphQL / Library RPC            │  │
│  │ (new endpoint)  │  │ calls WebPageParser DO           │  │
│  └────────┬────────┘  └──────────────┬───────────────────┘  │
│           │                          │                      │
│           ▼                          ▼                      │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ proxyImage()    │  │ WebPageParser DO (per-URL)       │  │
│  │ fetch & pass    │  │  ├─ init(url)                    │  │
│  │ through image   │  │  ├─ getMetadata() [existing]     │  │
│  └─────────────────┘  │  └─ getReaderContent() [NEW]     │  │
│                       │      │                           │  │
│                       │      ▼                           │  │
│                       │  ┌────────────────────────────┐  │  │
│                       │  │ fetchReaderContent.ts      │  │  │
│                       │  │  ├─ fetch HTML             │  │  │
│                       │  │  ├─ linkedom parse         │  │  │
│                       │  │  ├─ Readability extract    │  │  │
│                       │  │  └─ rewrite image URLs     │  │  │
│                       │  └────────────────────────────┘  │  │
│                       │      │                           │  │
│                       │      ▼                           │  │
│                       │  ┌────────────────────────────┐  │  │
│                       │  │ SQLite (reader_content)    │  │  │
│                       │  └────────────────────────────┘  │  │
│                       └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
packages/web-page-parser/src/
├── schema.ts          # + ReaderContent, ReaderResult
├── errors.ts          # NEW: TaggedErrors for fetch/parse failures
├── rpc.ts             # + getReaderContent RPC
└── index.ts           # + export new types and errors

apps/worker/src/
├── index.ts           # + /api/proxy-image route
└── features/web-page-parser/
    ├── WebPageParser.ts       # unchanged
    ├── handlers.ts            # + getReaderContent handler
    ├── fetchPageMetadata.ts   # unchanged
    ├── fetchReaderContent.ts  # NEW
    ├── proxyImage.ts          # NEW
    └── drizzle/
        ├── drizzle.schema.ts  # + readerContent table
        └── migrations/
            └── 0001_add_reader_content.sql  # NEW
```

## Schema Definitions

### Effect Schema (`packages/web-page-parser/src/schema.ts`)

```typescript
export const ReaderContent = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  textContent: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  byline: Schema.NullOr(Schema.String),
  siteName: Schema.NullOr(Schema.String),
  wordCount: Schema.Number,
  readingTimeMinutes: Schema.Number,
});

export type ReaderContent = typeof ReaderContent.Type;

export const ReaderResult = Schema.Struct({
  readable: Schema.Boolean,
  content: Schema.NullOr(ReaderContent),
  error: Schema.NullOr(Schema.String),
});

export type ReaderResult = typeof ReaderResult.Type;
```

### Tagged Errors (`packages/web-page-parser/src/errors.ts`)

```typescript
import {Schema} from "effect";

export class FetchTimeoutError extends Schema.TaggedError<FetchTimeoutError>()(
  "FetchTimeoutError",
  {url: Schema.String},
) {}

export class FetchHttpError extends Schema.TaggedError<FetchHttpError>()(
  "FetchHttpError",
  {url: Schema.String, status: Schema.Number},
) {}

export class FetchNetworkError extends Schema.TaggedError<FetchNetworkError>()(
  "FetchNetworkError",
  {url: Schema.String, message: Schema.String},
) {}

export class NotReadableError extends Schema.TaggedError<NotReadableError>()(
  "NotReadableError",
  {url: Schema.String},
) {}

export class ParseError extends Schema.TaggedError<ParseError>()(
  "ParseError",
  {url: Schema.String, message: Schema.String},
) {}

export class InvalidProtocolError extends Schema.TaggedError<InvalidProtocolError>()(
  "InvalidProtocolError",
  {url: Schema.String, protocol: Schema.String},
) {}
```

### RPC Definition (`packages/web-page-parser/src/rpc.ts`)

```typescript
export const WebPageParserRpcs = RpcGroup.make(
  Rpc.make("init", { ... }),          // existing
  Rpc.make("getMetadata", { ... }),   // existing
  Rpc.make("getReaderContent", {
    payload: Schema.Struct({
      forceFetch: Schema.optional(Schema.Boolean),
    }),
    success: ReaderResult,
  }),
);
```

### Drizzle Schema (`drizzle.schema.ts`)

```typescript
export const readerContent = sqliteTable("reader_content", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => id("wbp_read")),
  readable: integer("readable").notNull().default(0),
  title: text("title"),
  content: text("content"),
  textContent: text("text_content"),
  excerpt: text("excerpt"),
  byline: text("byline"),
  siteName: text("site_name"),
  wordCount: integer("word_count"),
  readingTimeMinutes: integer("reading_time_minutes"),
  error: text("error"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});
```

## Implementation Details

### fetchReaderContent.ts (Effect + @effect/platform HttpClient)

```typescript
import {HttpClient, HttpClientRequest, HttpClientError} from "@effect/platform";
import {parseHTML} from "linkedom/worker";
import {Readability} from "@mozilla/readability";
import {Effect, Duration} from "effect";
import type {ReaderContent} from "@kampus/web-page-parser";
import {
  FetchTimeoutError,
  FetchHttpError,
  FetchNetworkError,
  NotReadableError,
  ParseError,
  InvalidProtocolError,
} from "@kampus/web-page-parser";

const IMAGE_PROXY_BASE = "/api/proxy-image?url=";

// --- Pure helpers ---

const validateUrl = (url: string) =>
  Effect.try({
    try: () => {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw parsed.protocol;
      }
      return parsed;
    },
    catch: (e) => new InvalidProtocolError({url, protocol: String(e)}),
  });

const rewriteImageUrls = (html: string, baseUrl: string): string => {
  const {document} = parseHTML(html);
  for (const img of document.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (src) {
      const absoluteUrl = new URL(src, baseUrl).href;
      img.setAttribute("src", IMAGE_PROXY_BASE + encodeURIComponent(absoluteUrl));
    }
  }
  return document.toString();
};

const calculateReadingStats = (textContent: string) => {
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;
  return {wordCount, readingTimeMinutes: Math.ceil(wordCount / 200)};
};

// --- Main Effect ---

export const fetchReaderContent = (url: string) =>
  Effect.gen(function* () {
    yield* validateUrl(url);

    const client = yield* HttpClient.HttpClient;

    // Build request with headers
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders({
        "User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      }),
    );

    // Execute with timeout, map errors to domain errors
    const response = yield* client.execute(request).pipe(
      Effect.timeout(Duration.seconds(15)),
      Effect.catchTag("TimeoutException", () => Effect.fail(new FetchTimeoutError({url}))),
      Effect.catchTag("RequestError", (e) => Effect.fail(new FetchNetworkError({url, message: e.message}))),
      Effect.catchTag("ResponseError", (e) => Effect.fail(new FetchHttpError({url, status: e.response.status}))),
    );

    // Get HTML text
    const html = yield* response.text.pipe(
      Effect.catchTag("ResponseError", () => Effect.fail(new FetchNetworkError({url, message: "Failed to read body"}))),
    );

    // Parse with linkedom
    const {document} = yield* Effect.try({
      try: () => parseHTML(html),
      catch: (e) => new ParseError({url, message: String(e)}),
    });

    // Check if readable
    if (!Readability.isProbablyReadable(document)) {
      return yield* Effect.fail(new NotReadableError({url}));
    }

    // Extract with Readability
    const article = yield* Effect.try({
      try: () => new Readability(document.cloneNode(true) as Document, {charThreshold: 100}).parse(),
      catch: (e) => new ParseError({url, message: String(e)}),
    });

    if (!article) {
      return yield* Effect.fail(new ParseError({url, message: "Readability returned null"}));
    }

    // Build result
    const contentWithProxiedImages = rewriteImageUrls(article.content, url);
    const {wordCount, readingTimeMinutes} = calculateReadingStats(article.textContent);

    return {
      title: article.title,
      content: contentWithProxiedImages,
      textContent: article.textContent,
      excerpt: article.excerpt || null,
      byline: article.byline || null,
      siteName: article.siteName || null,
      wordCount,
      readingTimeMinutes,
    } satisfies ReaderContent;
  });

// Type: Effect<ReaderContent, FetchTimeoutError | FetchHttpError | FetchNetworkError | NotReadableError | ParseError | InvalidProtocolError, HttpClient.HttpClient>
// Note: Requires HttpClient service - provide via FetchHttpClient.layer in Cloudflare Workers
```

### Handler (`handlers.ts`)

```typescript
import {FetchHttpClient} from "@effect/platform";
import {fetchReaderContent} from "./fetchReaderContent";
import type {ReaderResult} from "@kampus/web-page-parser";

// Helper to convert domain errors to ReaderResult
const errorToResult = (url: string) =>
  Effect.catchAll((error: FetchTimeoutError | FetchHttpError | FetchNetworkError | NotReadableError | ParseError | InvalidProtocolError) =>
    Effect.succeed({
      readable: false,
      content: null,
      error: Match.value(error).pipe(
        Match.tag("FetchTimeoutError", () => "Request timed out"),
        Match.tag("FetchHttpError", (e) => `HTTP ${e.status}`),
        Match.tag("FetchNetworkError", (e) => e.message),
        Match.tag("NotReadableError", () => "Page is not article content"),
        Match.tag("ParseError", (e) => e.message),
        Match.tag("InvalidProtocolError", (e) => `Invalid protocol: ${e.protocol}`),
        Match.exhaustive,
      ),
    } satisfies ReaderResult)
  );

export const handlers = {
  init: ...,        // existing
  getMetadata: ..., // existing

  getReaderContent: ({forceFetch}: {forceFetch?: boolean}) =>
    Effect.gen(function* () {
      const ctx = yield* DurableObjectCtx;
      const db = yield* SqliteDrizzle;

      const url = yield* Effect.promise(() => ctx.storage.get<string>("url"));
      if (!url) {
        return yield* Effect.die(new Error("WebPageParser not initialized"));
      }

      // Check cache
      const [cached] = yield* db
        .select()
        .from(schema.readerContent)
        .orderBy(desc(schema.readerContent.createdAt))
        .limit(1);

      if (cached && isRecent(cached.createdAt) && !forceFetch) {
        return mapDbRowToResult(cached);
      }

      // Fetch fresh - errors converted to ReaderResult
      const result = yield* fetchReaderContent(url).pipe(
        Effect.map((content) => ({readable: true, content, error: null} satisfies ReaderResult)),
        errorToResult(url),
        Effect.provide(FetchHttpClient.layer),
      );

      // Store result (including error state)
      yield* db.insert(schema.readerContent).values(mapResultToDbRow(result));

      return result;
    }).pipe(Effect.orDie),
};
```

### Image Proxy (`proxyImage.ts`)

```typescript
export async function proxyImage(url: string): Promise<Response> {
  // Validate URL
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return new Response("Invalid URL protocol", {status: 400});
  }

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
      return new Response("Failed to fetch image", {status: res.status});
    }

    // Pass through with cache headers
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=86400", // 24h
      },
    });
  } catch {
    clearTimeout(timeoutId);
    return new Response("Image fetch failed", {status: 502});
  }
}
```

### Route (`index.ts`)

```typescript
app.get("/api/proxy-image", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.text("Missing url parameter", 400);
  }
  return proxyImage(decodeURIComponent(url));
});
```

## Migration SQL

```sql
-- 0001_add_reader_content.sql
CREATE TABLE `reader_content` (
  `id` text PRIMARY KEY NOT NULL,
  `readable` integer NOT NULL DEFAULT 0,
  `title` text,
  `content` text,
  `text_content` text,
  `excerpt` text,
  `byline` text,
  `site_name` text,
  `word_count` integer,
  `reading_time_minutes` integer,
  `error` text,
  `created_at` integer
);
```

## Dependencies

Add to `apps/worker/package.json`:

```json
{
  "dependencies": {
    "linkedom": "^0.18.0",
    "@mozilla/readability": "^0.5.0"
  }
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| URL not initialized | `Effect.die` (programming error) |
| HTTP error | Return `{readable: false, error: "HTTP 404"}` |
| Timeout | Return `{readable: false, error: "Request timed out"}` |
| Not readable | Return `{readable: false, error: "Page is not article content"}` |
| Parse failure | Return `{readable: false, error: "Failed to extract content"}` |

All errors cached to avoid repeated failed fetches.

## Design Decisions

**Separate tables for metadata vs reader content**
- `fetchlog` - metadata (title, description) - existing, unchanged
- `reader_content` - reader content - new table
- Rationale: simpler, no migration, metadata works for non-articles
- Future: could optimize to share fetch if needed

## Testing Strategy

1. **Unit tests** (`fetchReaderContent.spec.ts`)
   - Mock fetch, test HTML parsing
   - Test image URL rewriting
   - Test word count / reading time calculation

2. **Handler tests** (`web-page-parser-handlers.spec.ts`)
   - Test cache behavior
   - Test forceFetch bypass
   - Test error state caching

3. **Integration** (manual)
   - Test with real article URLs
   - Test image proxy with real images
