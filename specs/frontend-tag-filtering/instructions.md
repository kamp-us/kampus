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

- `storiesByTag(tagId: String!)` query returning StoryConnection

## Design Decisions (from original planning session)

- **Single-tag filtering only** for MVP (no multi-tag AND/OR)
- **Inline filter row** (not sidebar - sidebar is a separate future feature)
- Filter state could optionally persist in URL query params

## UX Notes

From product-design-advisor:
- Click-to-filter creates a nice "pivot" interaction
- When filtered, header could show context: "12 stories tagged productivity"
- Clicking a different tag while filtering should replace the current filter

## Related Specs

- **[frontend-story-tagging](../frontend-story-tagging/)** - Prerequisite (tag display and creation)
- **Future: Tag Sidebar Navigation** - Persistent sidebar with all tags
- **Future: Multi-Tag Filtering** - AND/OR filter logic
