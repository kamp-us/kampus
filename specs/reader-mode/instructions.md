# Reader Mode Feature

## Feature Overview

Extend the existing `web-page-parser` Durable Object to extract clean, readable article content from web pages - similar to Instapaper, Pocket, or Firefox Reader View. This removes ads, navigation, sidebars, and other distractions, leaving only the core article content.

## Why This Feature?

- Users sharing URLs want to read content without distractions
- Enables future features like offline reading, content summarization, and search
- Builds on existing web-page-parser infrastructure (same per-URL DO routing)

## User Stories

1. **As a user**, I want to view a clean version of shared articles so I can focus on the content without ads or navigation clutter.

2. **As a developer**, I want a simple RPC endpoint to fetch readable content from any URL so I can build reader experiences in the frontend.

## Acceptance Criteria

- [ ] New `getReaderContent` RPC endpoint on WebPageParser DO
- [ ] Extracts: title, content (HTML), textContent (plain), excerpt, byline, siteName, wordCount, readingTimeMinutes
- [ ] Returns `{ readable: false, error: "..." }` for non-article pages
- [ ] Caches extracted content for 24 hours (same as metadata)
- [ ] Images preserved with proxy URLs (`/api/proxy-image?url=...`)
- [ ] Timeout of 15 seconds for content fetch
- [ ] All existing `getMetadata` functionality unchanged

## Technical Decisions

- **Library**: `@mozilla/readability` + `linkedom/worker` (CF Workers compatible)
- **Architecture**: Extend existing DO (not a new DO)
- **Images**: Keep with proxy to avoid tracking/CORS issues
- **Cache**: Same 24h TTL as existing metadata

## Constraints

- Must work in Cloudflare Workers environment (no Node.js APIs)
- Must follow Spellbook pattern for DO handlers
- Must use Effect.ts patterns throughout
- SQLite storage via Drizzle

## Dependencies

- Existing `web-page-parser` feature
- `@mozilla/readability` npm package
- `linkedom` npm package (worker-compatible DOM parser)

## Out of Scope

- Frontend UI for reader mode (separate feature)
- Content summarization or AI processing
- Offline/PWA caching
- Full-text search indexing
