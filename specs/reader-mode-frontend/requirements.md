# Reader Mode Frontend - Requirements

## Functional Requirements

### FR-1: Navigation to Reader View
- **FR-1.1**: Story title in library list links to `/me/library/{storyId}`
- **FR-1.2**: Route parameter `storyId` used to fetch story data
- **FR-1.3**: Back button/link navigates to `/me/library`

### FR-2: GraphQL Data Layer
- **FR-2.1**: Add `ReaderContent` GraphQL type with fields: title, content, byline, siteName, wordCount, readingTimeMinutes, excerpt
- **FR-2.2**: Add `ReaderResult` GraphQL type with fields: readable, content, error
- **FR-2.3**: Add `readerContent` field on `Story` type
- **FR-2.4**: Resolver calls WebPageParser DO's `getReaderContent` RPC

### FR-3: Reader Page Display
- **FR-3.1**: Display site name (subdued, above title)
- **FR-3.2**: Display article title (prominent heading)
- **FR-3.3**: Display byline and reading time (metadata row)
- **FR-3.4**: Display article content as HTML (dangerouslySetInnerHTML)
- **FR-3.5**: Images render via existing `/api/proxy-image` URLs

### FR-4: Error Handling
- **FR-4.1**: Show error UI when `readable: false`
- **FR-4.2**: Error UI includes story URL and "View original" button
- **FR-4.3**: Show "not found" UI when story doesn't exist
- **FR-4.4**: Network errors handled by Suspense boundary

### FR-5: Library Page Updates
- **FR-5.1**: Story title changes from `<a href={url}>` to `<Link to={...}>`
- **FR-5.2**: Add "View original" menu item that opens URL in new tab

## Non-Functional Requirements

### NFR-1: Typography
- **NFR-1.1**: Max content width: 75ch
- **NFR-1.2**: Body text size: 1.125rem (18px)
- **NFR-1.3**: Line height: 1.65
- **NFR-1.4**: Paragraph spacing: 1.5em

### NFR-2: Layout
- **NFR-2.1**: Centered content column
- **NFR-2.2**: Vertical padding: 5rem top, 1.5rem sides
- **NFR-2.3**: Images max-width: 100%

### NFR-3: Performance
- **NFR-3.1**: Use React Suspense for loading states
- **NFR-3.2**: Single GraphQL query fetches all needed data

### NFR-4: Code Quality
- **NFR-4.1**: TypeScript strict mode compliance
- **NFR-4.2**: Biome lint/format passing
- **NFR-4.3**: CSS Modules for styling

## Acceptance Tests

### AT-1: Happy Path
1. Navigate to library with saved stories
2. Click story title
3. Verify URL is `/me/library/{storyId}`
4. Verify article content displays with proper typography
5. Click back button
6. Verify return to `/me/library`

### AT-2: Non-Readable Article
1. Save a URL that Readability cannot parse (e.g., login page)
2. Click story title
3. Verify error UI with "View original" button
4. Click "View original"
5. Verify original URL opens in new tab

### AT-3: View Original from Library
1. Navigate to library
2. Open story menu (three dots)
3. Click "View original"
4. Verify URL opens in new tab

### AT-4: Story Not Found
1. Navigate directly to `/me/library/invalid-id`
2. Verify "not found" UI displays
3. Verify link back to library works
