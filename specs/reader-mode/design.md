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
├── rpc.ts             # + getReaderContent RPC
└── index.ts           # + export new types

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

### fetchReaderContent.ts

```typescript
import {parseHTML} from "linkedom/worker";
import {Readability} from "@mozilla/readability";

const IMAGE_PROXY_BASE = "/api/proxy-image?url=";

function rewriteImageUrls(html: string, baseUrl: string): string {
  // Parse, find all img tags, rewrite src to proxy URL
  const {document} = parseHTML(html);
  for (const img of document.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (src) {
      const absoluteUrl = new URL(src, baseUrl).href;
      img.setAttribute("src", IMAGE_PROXY_BASE + encodeURIComponent(absoluteUrl));
    }
  }
  return document.toString();
}

export async function fetchReaderContent(url: string): Promise<ReaderResultType> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KampusBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {readable: false, content: null, error: `HTTP ${res.status}`};
    }

    const html = await res.text();
    const {document} = parseHTML(html);

    // Check if page is readable
    if (!Readability.isProbablyReadable(document)) {
      return {readable: false, content: null, error: "Page is not article content"};
    }

    const reader = new Readability(document.cloneNode(true), {
      charThreshold: 100,
    });
    const article = reader.parse();

    if (!article) {
      return {readable: false, content: null, error: "Failed to extract content"};
    }

    // Rewrite image URLs in extracted content
    const contentWithProxiedImages = rewriteImageUrls(article.content, url);

    const wordCount = article.textContent.split(/\s+/).filter(Boolean).length;

    return {
      readable: true,
      content: {
        title: article.title,
        content: contentWithProxiedImages,
        textContent: article.textContent,
        excerpt: article.excerpt || null,
        byline: article.byline || null,
        siteName: article.siteName || null,
        wordCount,
        readingTimeMinutes: Math.ceil(wordCount / 200),
      },
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {readable: false, content: null, error: "Request timed out"};
    }
    return {readable: false, content: null, error: String(err)};
  }
}
```

### Handler (`handlers.ts`)

```typescript
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

      // Fetch fresh
      const result = yield* Effect.promise(() => fetchReaderContent(url));

      // Store result
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
