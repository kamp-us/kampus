# Library Tags

## Feature Overview

Add a tagging system to the Library feature that allows users to organize their saved stories with custom tags. Each user can create their own set of tags with names and colors, then apply multiple tags to any story in their library.

### Why This Feature

Currently, stories in a user's library are stored as a flat list with no organizational structure beyond creation date. As libraries grow, users need a way to categorize and filter their saved content. Tags provide flexible, user-defined organization that scales with library size.

## User Stories

### As an end user, I want to:

1. **Create tags** with a custom name and color so I can define my own organizational system
2. **Edit tags** to update the name or color when my needs change
3. **Delete tags** I no longer need (with the tag being removed from all stories)
4. **View all my tags** in a list to see my organizational structure
5. **Tag a story** with one or more tags when saving or after saving
6. **Remove tags** from a story when they no longer apply
7. **Filter stories by tag** to find content on a specific topic
8. **See which tags** are applied to each story in my library

### As an API consumer, I want to:

1. **CRUD operations** for tags via GraphQL mutations
2. **Query tags** for the authenticated user
3. **Associate/disassociate** tags with stories via mutations
4. **Filter story queries** by tag ID
5. **Include tag data** when fetching stories

### As an internal system, I want to:

1. **Reliable data integrity** - tag deletions cascade to story associations
2. **Efficient queries** - proper indexing for tag-based filtering
3. **Consistent IDs** - prefixed IDs following project conventions

## Acceptance Criteria

### Tag Management

- [ ] User can create a tag with a name (required, non-empty string) and color (required, hex color format)
- [ ] User can update a tag's name and/or color
- [ ] User can delete a tag, which removes it from all associated stories
- [ ] User can list all their tags
- [ ] Tag names are unique within a user's library (case-insensitive)
- [ ] Tags are scoped per-user (not shared globally)

### Story Tagging

- [ ] User can add multiple tags to a single story
- [ ] User can remove specific tags from a story
- [ ] User can view which tags are applied to a story
- [ ] Duplicate tag applications are idempotent (no error, no duplicates)

### Querying

- [ ] User can retrieve all stories with a specific tag
- [ ] User can retrieve stories with any of multiple tags (OR filter)
- [ ] Story responses include their associated tags

### Data Integrity

- [ ] Deleting a tag removes all story-tag associations
- [ ] Deleting a story removes all its tag associations
- [ ] Tag IDs use the `tag_` prefix (via `id("tag")`)
- [ ] Story-tag associations have composite primary key

## Constraints

### Technical Constraints

- Tags stored in the Library Durable Object (same as stories)
- Uses Drizzle ORM with SQLite for persistence
- GraphQL API via GQLoom with Effect Schema
- Must follow existing patterns in the codebase

### Data Model Constraints

- Tag properties: `id`, `name`, `color`, `createdAt`
- Color format: 6-character hex (e.g., `ff5733`)
- Many-to-many relationship via junction table
- One Library DO per user (keyed by user ID)

### API Constraints

- All mutations require authentication
- Tag operations scoped to authenticated user's library
- Follows GQLoom resolver patterns with Effect

## Dependencies

- **Library Durable Object** (`apps/worker/src/features/library/Library.ts`) - existing feature to extend
- **Drizzle ORM** - for database schema and migrations
- **GQLoom + Effect** - for GraphQL API layer
- **@usirin/forge** - for ID generation (`id("tag")`)

## Out of Scope

The following are explicitly NOT part of this feature:

- **Nested tags / tag hierarchies** - Tags are flat, no parent-child relationships
- **Tag suggestions / auto-complete** - No smart suggestions based on content
- **Shared / global tags** - Tags are per-user only
- **Tag limits** - No maximum number of tags per user or per story
- **Tag icons / emojis** - Only name and color, no additional visual properties
- **Bulk tagging operations** - Tag one story at a time (can be added later)
- **Tag-based sorting** - Only filtering, not custom sort orders
- **Frontend UI** - This spec covers backend/API only
