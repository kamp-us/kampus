# Reader Mode Frontend

## Feature Overview

Add a reader view page at `/me/library/{storyId}` that displays extracted article content in a clean, distraction-free reading experience. This is the frontend counterpart to the existing `reader-mode` backend feature.

## Why This Feature?

- Users save articles to read later, but often encounter cluttered original pages
- Reader mode provides focused, typography-optimized reading experience
- Leverages existing backend content extraction (Readability)

## User Stories

1. **As a user**, I want to click on a saved story to read its extracted content in a clean view so I can focus on reading without distractions.

2. **As a user**, I want to navigate back to my library easily after reading so I can continue browsing my saved articles.

3. **As a user**, I want to see reading time estimate so I can decide if I have time to read the article.

4. **As a user**, I want to open the original URL when the extracted version isn't available or if I prefer the original.

## Acceptance Criteria

- [ ] Click story title in library → navigates to `/me/library/{storyId}`
- [ ] Reader page displays: title, byline, site name, reading time, article content
- [ ] Back button returns to `/me/library`
- [ ] "View original" option available in menu
- [ ] Error state when article isn't readable (with fallback to original)
- [ ] Loading state with skeleton while fetching
- [ ] Typography optimized: ~75ch line length, 1.65 line-height

## Technical Decisions

- **Data fetching**: GraphQL only (no effect-atom/RPC for this feature)
- **HTML rendering**: Trust backend (Readability strips scripts)
- **CSS units**: `ch` for line length, `rem` for spacing
- **Mobile**: Defer to later iteration

## Constraints

- Must integrate with existing Library page and routing
- Must use existing GraphQL patterns (useLazyLoadQuery)
- Follow design system conventions (CSS modules, no className override)

## Dependencies

- Backend `getReaderContent` RPC on WebPageParser DO (completed)
- GraphQL resolver to expose reader content
- Existing Library page routing

## Out of Scope

- Mobile-specific optimizations
- Reading progress persistence
- Font size/theme customization
- Scroll position memory
- Keyboard shortcuts
