# Frontend Tag Filtering - Instructions

**Status:** Planned (not started)
**Depends on:** [frontend-story-tagging](../frontend-story-tagging/) (must be completed first)

## Feature Overview

Add filtering functionality to the library page so users can filter their story list by a specific tag.

## User Stories

**As a user browsing my library, I want to:**
- Filter my story list to show only stories with a specific tag
- Click on any visible tag to filter by it immediately
- Clear the active filter to return to viewing all stories
- See how many stories match the current filter

## Key Components

### TagFilterRow
- Inline filter row above the story list (below "Add Story" form)
- Shows "All stories" state when no filter is active
- Shows active tag as a dismissible chip when filtering
- Displays count of filtered results (e.g., "5 stories")

### Story Row Enhancement
- Tags on story rows become clickable
- Clicking a tag activates filtering by that tag

## GraphQL

- `Library.storiesByTag(tagName: String!)` field returning `StoryConnection`
- Uses tag name (not ID) for URL-friendly routing: `/me/library/my-awesome-tag`
- Reuses existing `StoryConnection` type with cursor-based pagination

## Design Decisions (from original planning session)

- **Single-tag filtering only** for MVP (no multi-tag AND/OR)
- **Inline filter row** (not sidebar - sidebar is a separate future feature)
- **URL query param** for filter state: `/me/library?tag=my-awesome-tag`
  - Enables bookmarking and sharing filtered views
  - Tag name in URL (not ID) for readability

## UX Notes

From product-design-advisor:
- Click-to-filter creates a nice "pivot" interaction
- When filtered, header could show context: "12 stories tagged productivity"
- Clicking a different tag while filtering should replace the current filter

## Empty State

When filtering returns zero stories:
- Show message: "No stories tagged '[tag-name]'"
- Provide clear action to remove filter and return to all stories

## Acceptance Criteria

- [ ] User can click any tag on a story row to filter by that tag
- [ ] Filter state is reflected in URL query param (`?tag=tag-name`)
- [ ] TagFilterRow shows active filter with tag name and dismissible chip
- [ ] TagFilterRow displays count of filtered results (e.g., "5 stories")
- [ ] User can clear filter via dismiss button or "All stories" action
- [ ] Clicking a different tag replaces the current filter
- [ ] Empty state shows helpful message when no stories match filter
- [ ] Direct navigation to filtered URL (`/me/library?tag=foo`) works correctly
- [ ] Page loads all stories when no tag param is present

## Related Specs

- **[frontend-story-tagging](../frontend-story-tagging/)** - Prerequisite (tag display and creation)
- **Future: Tag Sidebar Navigation** - Persistent sidebar with all tags
- **Future: Multi-Tag Filtering** - AND/OR filter logic
