# Web Page Parser Refactor

## Feature Overview

Refactor the web-page-parser package to use a unified linkedom-centered architecture with Readability as the primary extraction strategy and selector-based extraction as fallback.

**RFC**: https://github.com/kamp-us/kampus/issues/30

## Problem Statement

Current architecture is fragmented:
- Two fetch implementations (native fetch vs Effect HttpClient)
- Two parsing approaches (HTMLRewriter vs linkedom+Readability)
- No fallback when Readability fails
- Metadata unavailable on extraction failure
- Scattered error handling

## User Stories

1. **As a reader mode user**, I want content extraction to work on more pages, even if Readability fails, so I can read articles without distractions.

2. **As a developer**, I want a single parsing pipeline so the codebase is easier to maintain and extend.

3. **As a product**, I want to always return metadata (title, description) even when full content extraction fails, so UI can show something useful.

## Acceptance Criteria

1. Single fetch implementation using Effect HttpClient
2. Single parse step using linkedom
3. Metadata always extracted regardless of content extraction result
4. Content extraction tries Readability first, falls back to selector-based
5. Return type includes `strategy` field indicating which method succeeded
6. `ReaderResult` always includes metadata
7. Backward compatible RPC interface (getMetadata, getReaderContent still work)
8. HTMLRewriter removed from codebase

## Constraints

- Must run in Cloudflare Workers environment
- Keep linkedom as DOM parser (already worker-compatible)
- Maintain 24h cache TTL (can revisit later)
- Image proxy must apply to all extracted content

## Dependencies

- `@mozilla/readability` - primary extraction
- `linkedom` - DOM parsing
- `@effect/platform` HttpClient - fetching
- Existing Durable Object infrastructure

## Out of Scope

- Site-specific extraction rules
- Custom selector configuration per-request (future enhancement)
- Cache TTL optimization based on strategy
- Detailed error breakdown (Readability vs selector failure)
