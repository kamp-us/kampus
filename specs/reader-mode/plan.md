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

### Step 3: Add TaggedErrors

**File:** `packages/web-page-parser/src/errors.ts` (NEW)

- `FetchTimeoutError` - url field
- `FetchHttpError` - url, status fields
- `FetchNetworkError` - url, message fields
- `NotReadableError` - url field
- `ParseError` - url, message fields
- `InvalidProtocolError` - url, protocol fields
- Use `Schema.TaggedError` pattern

### Step 4: Add RPC Definition + Exports

**Files:** `packages/web-page-parser/src/rpc.ts`, `index.ts`

- Add `getReaderContent` RPC with `{ forceFetch?: boolean }` payload
- Export `ReaderContent`, `ReaderResult` types and all errors

### Step 5: Add Database Schema + Migration

**File:** `apps/worker/src/features/web-page-parser/drizzle/drizzle.schema.ts`

- Add `readerContent` table definition
- Run `pnpm exec drizzle-kit generate`

### Step 6: Create fetchReaderContent (Effect + HttpClient)

**File:** `apps/worker/src/features/web-page-parser/fetchReaderContent.ts`

- Use `HttpClient` from `@effect/platform`
- Use `HttpClientRequest.get` with headers
- Apply `Effect.timeout(Duration.seconds(15))`
- Map HttpClient errors to domain TaggedErrors via `Effect.catchTag`
- Parse with `linkedom/worker`, extract with `Readability`
- Rewrite image URLs to proxy
- Return `Effect<ReaderContent, ...errors, HttpClient>`
- Tests: happy path, error types, image rewriting

### Step 7: Create Image Proxy (Effect + HttpClient)

**File:** `apps/worker/src/features/web-page-parser/proxyImage.ts`

- Use `HttpClient` from `@effect/platform`
- Apply `Effect.timeout(Duration.seconds(10))`
- Map HttpClient errors to domain TaggedErrors via `Effect.catchTag`
- Stream response body with Cache-Control header
- Return `Effect<Response, ...errors, HttpClient>`
- Tests: error types, cache headers

### Step 8: Add Handler

**File:** `apps/worker/src/features/web-page-parser/handlers.ts`

- Add `getReaderContent` handler
- Convert TaggedErrors to `ReaderResult` using `Match.value` + `Match.tag`
- Provide `FetchHttpClient.layer`
- Cache pattern (24h TTL)
- Tests: cache behavior, error conversion

### Step 9: Add Route (Effect error handling)

**File:** `apps/worker/src/index.ts`

- Add `/api/proxy-image` GET route
- Run proxyImage Effect with `Effect.runPromise`
- Convert TaggedErrors to HTTP responses using `Match`
- Provide `FetchHttpClient.layer`
- Tests: param validation, error responses, proxying

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
| `packages/web-page-parser/src/errors.ts` | NEW - TaggedErrors |
| `packages/web-page-parser/src/rpc.ts` | add RPC |
| `packages/web-page-parser/src/index.ts` | export types + errors |
| `apps/worker/.../drizzle/drizzle.schema.ts` | add table |
| `apps/worker/.../drizzle/migrations/0001_*.sql` | generated |
| `apps/worker/.../fetchReaderContent.ts` | NEW - Effect + HttpClient |
| `apps/worker/.../proxyImage.ts` | NEW |
| `apps/worker/.../handlers.ts` | add handler |
| `apps/worker/src/index.ts` | add route |

## Progress

- [ ] Step 1: Add dependencies
- [ ] Step 2: Add Effect schemas
- [ ] Step 3: Add TaggedErrors
- [ ] Step 4: Add RPC + exports
- [ ] Step 5: Add database schema + migration
- [ ] Step 6: Create fetchReaderContent with tests
- [ ] Step 7: Create image proxy with tests
- [ ] Step 8: Add handler with tests
- [ ] Step 9: Add route with tests
- [ ] Verification
