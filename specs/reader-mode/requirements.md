# Reader Mode - Requirements

## Functional Requirements

### FR-1: Content Extraction RPC

| ID | Requirement |
|----|-------------|
| FR-1.1 | `getReaderContent({ forceFetch?: boolean })` RPC endpoint on WebPageParser DO |
| FR-1.2 | Returns `ReaderResult` schema with `readable`, `content`, `error` fields |
| FR-1.3 | When `readable: true`, content includes: title, content (HTML), textContent, excerpt, byline, siteName, wordCount, readingTimeMinutes |
| FR-1.4 | When `readable: false`, returns error message explaining why |
| FR-1.5 | `forceFetch: true` bypasses cache and fetches fresh content |

### FR-2: Content Processing

| ID | Requirement |
|----|-------------|
| FR-2.1 | Parse HTML using `linkedom/worker` DOM implementation |
| FR-2.2 | Extract readable content using `@mozilla/readability` |
| FR-2.3 | Calculate word count from extracted text content |
| FR-2.4 | Calculate reading time (words / 200 WPM, rounded up) |
| FR-2.5 | Preserve article structure (headings, paragraphs, lists, code blocks) |

### FR-3: Image Handling

| ID | Requirement |
|----|-------------|
| FR-3.1 | Rewrite image `src` attributes to proxy URL format |
| FR-3.2 | Proxy URL format: `/api/proxy-image?url=<encoded-original-url>` |
| FR-3.3 | Image proxy endpoint fetches and passes through original image |
| FR-3.4 | Proxy sets appropriate cache headers on response |

### FR-4: Caching

| ID | Requirement |
|----|-------------|
| FR-4.1 | Store extracted content in SQLite (per-DO instance) |
| FR-4.2 | Cache TTL: 24 hours (same as metadata) |
| FR-4.3 | Return cached content if within TTL and `forceFetch` not set |
| FR-4.4 | Store error state for non-readable pages (avoid repeated fetch attempts) |

### FR-5: Backward Compatibility

| ID | Requirement |
|----|-------------|
| FR-5.1 | Existing `init()` and `getMetadata()` RPCs unchanged |
| FR-5.2 | Existing `fetchlog` table and schema unchanged |
| FR-5.3 | No breaking changes to WebPageParserRpcs type |

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Content fetch timeout: 15 seconds max |
| NFR-1.2 | Image proxy timeout: 10 seconds max |
| NFR-1.3 | Cached responses return in < 50ms |

### NFR-2: Reliability

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Graceful degradation: return error object, never throw |
| NFR-2.2 | Handle malformed HTML without crashing |
| NFR-2.3 | Handle timeout/network errors with descriptive messages |

### NFR-3: Security

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Only allow HTTP/HTTPS URLs (no file://, data://, etc.) |
| NFR-3.2 | Image proxy validates URL protocol before fetching |
| NFR-3.3 | Set appropriate User-Agent header on requests |

### NFR-4: Compatibility

| ID | Requirement |
|----|-------------|
| NFR-4.1 | Must work in Cloudflare Workers runtime |
| NFR-4.2 | No Node.js-specific APIs |
| NFR-4.3 | Follow Effect.ts patterns for all handlers |
| NFR-4.4 | Follow Spellbook pattern for DO structure |

## Data Models

### ReaderContent Schema

```typescript
{
  title: string,
  content: string,           // sanitized HTML with proxied images
  textContent: string,       // plain text
  excerpt: string | null,
  byline: string | null,
  siteName: string | null,
  wordCount: number,
  readingTimeMinutes: number,
}
```

### ReaderResult Schema

```typescript
{
  readable: boolean,
  content: ReaderContent | null,
  error: string | null,
}
```

### Database Table: reader_content

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Auto-generated ID (`wbp_read` prefix) |
| readable | INTEGER | 0 or 1 |
| title | TEXT | Extracted title |
| content | TEXT | HTML content |
| text_content | TEXT | Plain text |
| excerpt | TEXT | Article excerpt |
| byline | TEXT | Author info |
| site_name | TEXT | Site name |
| word_count | INTEGER | Word count |
| reading_time_minutes | INTEGER | Reading time |
| error | TEXT | Error message if not readable |
| created_at | INTEGER | Unix timestamp ms |

## Acceptance Tests

| ID | Test |
|----|------|
| AT-1 | Call `getReaderContent` on article URL → returns readable content |
| AT-2 | Call `getReaderContent` on non-article (e.g., homepage) → returns `readable: false` |
| AT-3 | Call `getReaderContent` twice within 24h → second call returns cached |
| AT-4 | Call `getReaderContent` with `forceFetch: true` → fetches fresh |
| AT-5 | Images in content have proxied URLs |
| AT-6 | Image proxy returns original image with cache headers |
| AT-7 | Existing `getMetadata` still works unchanged |
