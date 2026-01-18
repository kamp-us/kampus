# Reader Mode - Implementation Plan

## Overview

Add `getReaderContent` RPC to WebPageParser DO for Instapaper-like content extraction.

## Implementation Steps

### Step 1: Add Dependencies

**File:** `apps/worker/package.json`

```bash
pnpm --filter worker add linkedom @mozilla/readability
pnpm --filter worker add -D @types/mozilla__readability
```

### Step 2: Add Effect Schemas

**File:** `packages/web-page-parser/src/schema.ts`

- Add `ReaderContent` schema (title, content, textContent, excerpt, byline, siteName, wordCount, readingTimeMinutes)
- Add `ReaderResult` schema (readable, content, error)
- Export types

### Step 3: Add RPC Definition

**File:** `packages/web-page-parser/src/rpc.ts`

- Add `getReaderContent` RPC with `{ forceFetch?: boolean }` payload
- Returns `ReaderResult`

### Step 4: Export New Types

**File:** `packages/web-page-parser/src/index.ts`

- Export `ReaderContent`, `ReaderResult` types

### Step 5: Add Database Schema

**File:** `apps/worker/src/features/web-page-parser/drizzle/drizzle.schema.ts`

- Add `readerContent` table definition

### Step 6: Generate Migration

```bash
cd apps/worker
pnpm exec drizzle-kit generate
```

- Creates `0001_add_reader_content.sql`

### Step 7: Create fetchReaderContent

**File:** `apps/worker/src/features/web-page-parser/fetchReaderContent.ts`

- Fetch URL with 15s timeout
- Parse with `linkedom/worker`
- Extract with `Readability`
- Rewrite image URLs to proxy
- Calculate word count / reading time
- Return `ReaderResult`

### Step 8: Create Image Proxy

**File:** `apps/worker/src/features/web-page-parser/proxyImage.ts`

- Validate URL protocol
- Fetch with 10s timeout
- Pass through with cache headers

### Step 9: Add Handler

**File:** `apps/worker/src/features/web-page-parser/handlers.ts`

- Add `getReaderContent` handler
- Check cache (24h TTL)
- Fetch if needed
- Store result

### Step 10: Add Route

**File:** `apps/worker/src/index.ts`

- Add `/api/proxy-image` GET route
- Import and call `proxyImage`

### Step 11: Tests

**File:** `apps/worker/test/web-page-parser-handlers.spec.ts`

- Test `getReaderContent` returns cached data
- Test `forceFetch` bypasses cache
- Test error state handling

## Verification

1. `turbo run typecheck` - passes
2. `pnpm --filter worker run test` - passes
3. Manual: call `getReaderContent` on article URL
4. Manual: verify images load through proxy

## File Change Summary

| File | Action |
|------|--------|
| `apps/worker/package.json` | add deps |
| `packages/web-page-parser/src/schema.ts` | add schemas |
| `packages/web-page-parser/src/rpc.ts` | add RPC |
| `packages/web-page-parser/src/index.ts` | export types |
| `apps/worker/.../drizzle/drizzle.schema.ts` | add table |
| `apps/worker/.../drizzle/migrations/0001_*.sql` | generated |
| `apps/worker/.../fetchReaderContent.ts` | new |
| `apps/worker/.../proxyImage.ts` | new |
| `apps/worker/.../handlers.ts` | add handler |
| `apps/worker/src/index.ts` | add route |
| `apps/worker/test/web-page-parser-handlers.spec.ts` | add tests |

## Progress

- [ ] Step 1: Add dependencies
- [ ] Step 2: Add Effect schemas
- [ ] Step 3: Add RPC definition
- [ ] Step 4: Export new types
- [ ] Step 5: Add database schema
- [ ] Step 6: Generate migration
- [ ] Step 7: Create fetchReaderContent
- [ ] Step 8: Create image proxy
- [ ] Step 9: Add handler
- [ ] Step 10: Add route
- [ ] Step 11: Tests
- [ ] Verification
