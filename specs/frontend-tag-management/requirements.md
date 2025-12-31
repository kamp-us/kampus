# Frontend Tag Management - Requirements

**Derived from:** [instructions.md](./instructions.md)

## Functional Requirements

### FR-1: Tag List View

| ID | Requirement |
|----|-------------|
| FR-1.1 | System SHALL display all user tags at `/library/tags` route |
| FR-1.2 | Each tag row SHALL display: color indicator, tag name, story count |
| FR-1.3 | Story count SHALL be derived from `stories.totalCount` on the tag's story connection |
| FR-1.4 | Tags SHALL be listed in alphabetical order by name |
| FR-1.5 | Page SHALL include navigation back to `/library` |

### FR-2: Tag Renaming

| ID | Requirement |
|----|-------------|
| FR-2.1 | User SHALL be able to rename any tag via inline editing |
| FR-2.2 | Clicking "Rename" action SHALL transform the tag name into an editable input |
| FR-2.3 | Input SHALL be pre-filled with the current tag name |
| FR-2.4 | Pressing Enter SHALL save the new name |
| FR-2.5 | Pressing Escape SHALL cancel editing without changes |
| FR-2.6 | System SHALL reject duplicate tag names (case-insensitive) |
| FR-2.7 | System SHALL display validation error for duplicate names |

### FR-3: Tag Color Change

| ID | Requirement |
|----|-------------|
| FR-3.1 | User SHALL be able to change tag color via ColorPicker |
| FR-3.2 | ColorPicker SHALL display 8 preset colors as swatches |
| FR-3.3 | Preset colors: `#FF6B6B` (red), `#4ECDC4` (teal), `#45B7D1` (blue), `#FFA07A` (orange), `#98D8C8` (mint), `#F7DC6F` (yellow), `#BB8FCE` (purple), `#85C1E2` (sky) |
| FR-3.4 | Clicking a swatch SHALL immediately update the tag color |
| FR-3.5 | Clicking outside ColorPicker SHALL dismiss it without changes |

### FR-4: Tag Deletion

| ID | Requirement |
|----|-------------|
| FR-4.1 | User SHALL be able to delete any tag |
| FR-4.2 | Delete action SHALL trigger a confirmation dialog |
| FR-4.3 | Confirmation dialog SHALL display the tag name |
| FR-4.4 | Confirmation dialog SHALL display the number of affected stories |
| FR-4.5 | Confirmation dialog SHALL clarify that stories will NOT be deleted |
| FR-4.6 | Confirming deletion SHALL remove the tag from all associated stories |
| FR-4.7 | Canceling SHALL dismiss the dialog without changes |

### FR-5: Tag Creation

| ID | Requirement |
|----|-------------|
| FR-5.1 | Page SHALL include a "Create new tag" action |
| FR-5.2 | Creating a tag SHALL use the existing tag creation flow (from story tagging feature) |

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Tag list SHALL load within 500ms on standard connections |
| NFR-1.2 | Mutations (rename, recolor, delete) SHALL provide optimistic UI updates |

### NFR-2: Accessibility

| ID | Requirement |
|----|-------------|
| NFR-2.1 | All interactive elements SHALL be keyboard accessible |
| NFR-2.2 | ColorPicker swatches SHALL have accessible labels (color names) |
| NFR-2.3 | Delete confirmation SHALL be an accessible AlertDialog |

### NFR-3: Consistency

| ID | Requirement |
|----|-------------|
| NFR-3.1 | UI components SHALL use existing design system components |
| NFR-3.2 | Color palette SHALL match colors used in story tagging feature |

## GraphQL Requirements

### GQL-1: Connection Enhancement

| ID | Requirement |
|----|-------------|
| GQL-1.1 | All Connection types SHALL support `totalCount` field |
| GQL-1.2 | `totalCount` SHALL be added to `createConnectionSchema` helper |
| GQL-1.3 | `totalCount` SHALL return the total number of items in the connection |

### GQL-2: Tag Mutations

| ID | Requirement |
|----|-------------|
| GQL-2.1 | `updateTag` mutation SHALL accept: `id` (required), `name` (optional), `color` (optional) |
| GQL-2.2 | `deleteTag` mutation SHALL accept: `id` (required) |
| GQL-2.3 | Both mutations SHALL validate tag ownership (user can only modify own tags) |

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| frontend-story-tagging | Complete | Provides tag UI patterns, color palette |
| library-tags backend | Complete | Provides updateTag, deleteTag mutations |

## Acceptance Criteria

1. User can navigate to `/library/tags` and see all their tags
2. Each tag shows its color, name, and story count
3. User can rename a tag inline with Enter to save, Escape to cancel
4. User cannot create duplicate tag names
5. User can change tag color via ColorPicker with 8 preset options
6. User can delete a tag with confirmation showing affected stories
7. All changes persist and reflect across the library
