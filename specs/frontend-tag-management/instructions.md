# Frontend Tag Management - Instructions

**Status:** Planned (not started)
**Depends on:** [frontend-story-tagging](../frontend-story-tagging/) (must be completed first)

## Feature Overview

Add a dedicated tag management page where users can view, rename, recolor, and delete their tags.

## User Stories

**As a user managing my tag collection, I want to:**
- View all my tags in one place
- See how many stories use each tag
- Rename tags (updating all associated stories automatically)
- Change tag colors for better visual organization
- Delete tags I no longer need (with confirmation)

## Key Components

### Tag Management Page (`/library/tags`)
- Dedicated route for tag management
- Lists all tags with: color indicator, name, story count
- Actions per tag: Rename, Change color, Delete
- "Create new tag" action
- Back link to library page

### ColorPicker Component
- Small popover with color swatches
- 8 preset colors from the palette:
  - FF6B6B (red), 4ECDC4 (teal), 45B7D1 (blue), FFA07A (orange)
  - 98D8C8 (mint), F7DC6F (yellow), BB8FCE (purple), 85C1E2 (sky)
- Click to select, click outside to dismiss

### Inline Rename
- Click "Rename" to enable inline editing
- Input pre-filled with current name
- Enter to save, Escape to cancel
- Error if new name already exists

### Delete Confirmation
- AlertDialog confirmation
- Shows tag name and affected story count
- Clarifies stories will NOT be deleted
- Removes tag from all associated stories

## GraphQL

- `updateTag(id: String!, name: String, color: String)` mutation
- `deleteTag(id: String!)` mutation
- Tag type needs `storyCount` field (or computed client-side)

## Design Notes

From product-design-advisor:
- "Keep it boring" - standard list with row actions
- Not a place for innovation, just functional CRUD
- Confirmation required for delete (destructive operation)

## Constraints

- No destructive operations without confirmation
- Tag names must remain unique (case-insensitive)
- Renaming updates all story associations automatically (handled by backend)

## Related Specs

- **[frontend-story-tagging](../frontend-story-tagging/)** - Prerequisite
- **[library-tags](../library-tags/)** - Backend implementation (already supports updateTag, deleteTag)
