# Reader Mode Frontend - Implementation Plan

## Task Sequence

### Task 1: Add GraphQL Types
**File:** `apps/worker/src/graphql/schema.ts`

1. Add `ReaderContentType` GraphQL object type
2. Add `ReaderResultType` GraphQL object type
3. Verify types match backend schema from `@kampus/web-page-parser`

**Verification:** `turbo run typecheck`

### Task 2: Extend WebPageParserClient
**File:** `apps/worker/src/graphql/resolvers/WebPageParserClient.ts`

1. Add `getReaderContent()` method to client interface
2. Call `client.getReaderContent({})` from WebPageParser RPC

**Verification:** `turbo run typecheck`

### Task 3: Add readerContent Field to Story
**File:** `apps/worker/src/graphql/schema.ts`

1. Add `readerContent` field to `StoryType`
2. Implement resolver using `WebPageParserClient.make()`
3. Handle errors gracefully (return `{ readable: false, error: ... }`)

**Verification:**
- `turbo run typecheck`
- Test query in GraphQL playground

### Task 4: Create ReaderPage Component
**Files:**
- `apps/kamp-us/src/pages/library/ReaderPage.tsx`
- `apps/kamp-us/src/pages/library/ReaderPage.module.css`

1. Create GraphQL query `ReaderPageQuery`
2. Implement `ReaderPageContent` with useLazyLoadQuery
3. Implement `NotFound` component
4. Implement `NotReadable` component
5. Implement `ReaderSkeleton` component
6. Wrap in Suspense boundary
7. Style with CSS module

**Verification:** `turbo run typecheck && turbo run lint`

### Task 5: Add Route
**File:** `apps/kamp-us/src/main.tsx`

1. Import `ReaderPage`
2. Add route `{ path: "/me/library/:storyId", element: <ReaderPage /> }`

**Verification:** `turbo run typecheck`

### Task 6: Generate Relay Artifacts
**Command:** `pnpm --filter kamp-us run relay`

1. Run Relay compiler to generate types
2. Fix any type errors from generated code

**Verification:** `turbo run typecheck`

### Task 7: Update StoryRow
**File:** `apps/kamp-us/src/pages/Library.tsx`

1. Change story title from `<a>` to `<Link to={/me/library/${story.id}}>`
2. Add "View original" item to Menu
3. Import `Link` from `react-router`

**Verification:** `turbo run typecheck && turbo run lint`

### Task 8: Manual Testing

1. Start dev servers: `turbo run dev`
2. Navigate to library
3. Click story title → verify reader page loads
4. Verify back button works
5. Test "View original" in menu
6. Test error state with non-readable URL

## Rollback Plan

If issues arise:
1. Revert StoryRow changes (restore `<a>` tag)
2. Remove route from main.tsx
3. Keep GraphQL additions (backward compatible)

## Files Modified

| File | Change |
|------|--------|
| `apps/worker/src/graphql/schema.ts` | Add types + field |
| `apps/worker/src/graphql/resolvers/WebPageParserClient.ts` | Add method |
| `apps/kamp-us/src/pages/library/ReaderPage.tsx` | New |
| `apps/kamp-us/src/pages/library/ReaderPage.module.css` | New |
| `apps/kamp-us/src/main.tsx` | Add route |
| `apps/kamp-us/src/pages/Library.tsx` | Update StoryRow |
