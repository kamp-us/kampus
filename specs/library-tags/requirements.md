# Library Tags - Requirements

Structured requirements analysis derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR-1: Tag Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | System shall allow authenticated users to create tags with a name and color | Must |
| FR-1.2 | System shall enforce unique tag names per user (case-insensitive) | Must |
| FR-1.3 | System shall allow users to update tag name and/or color | Must |
| FR-1.4 | System shall allow users to delete tags | Must |
| FR-1.5 | System shall cascade tag deletion to remove all story-tag associations | Must |
| FR-1.6 | System shall allow users to list all their tags | Must |
| FR-1.7 | System shall isolate tags per user (no cross-user visibility) | Must |

### FR-2: Story Tagging

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | System shall allow users to associate one or more tags with a story | Must |
| FR-2.2 | System shall allow users to remove tag associations from a story | Must |
| FR-2.3 | System shall handle duplicate tag associations idempotently | Must |
| FR-2.4 | System shall return associated tags when fetching story details | Must |
| FR-2.5 | System shall remove tag associations when a story is deleted | Must |

### FR-3: Querying & Filtering

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | System shall allow filtering stories by a single tag | Must |
| FR-3.2 | System shall allow filtering stories by multiple tags (OR logic) | Should |
| FR-3.3 | System shall include tag count or tag list in story list responses | Should |

### FR-4: Durable Object API

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Library DO shall expose `createTag(name, color)` method | Must |
| FR-4.2 | Library DO shall expose `updateTag(id, name?, color?)` method | Must |
| FR-4.3 | Library DO shall expose `deleteTag(id)` method | Must |
| FR-4.4 | Library DO shall expose `listTags()` method | Must |
| FR-4.5 | Library DO shall expose `tagStory(storyId, tagIds)` method | Must |
| FR-4.6 | Library DO shall expose `untagStory(storyId, tagIds)` method | Must |
| FR-4.7 | Library DO shall expose `getTagsForStory(storyId)` method | Must |
| FR-4.8 | Library DO shall expose `getStoriesByTag(tagId)` method | Must |

> **Note:** GraphQL layer will be added in a future iteration.

## Non-Functional Requirements

### NFR-1: Data Integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1.1 | Tag IDs shall use the `tag_` prefix via `id("tag")` | Must |
| NFR-1.2 | Story-tag junction table shall use composite primary key | Must |
| NFR-1.3 | Foreign key relationships shall be enforced at application level | Must |
| NFR-1.4 | All tag operations shall be atomic within transactions | Must |

### NFR-2: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-2.1 | Tag lookup by ID shall be indexed (primary key) | Must |
| NFR-2.2 | Story-tag lookups shall be indexed on both foreign keys | Must |
| NFR-2.3 | Tag name uniqueness check shall be efficient (indexed) | Should |

### NFR-3: Consistency

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-3.1 | System shall follow existing Drizzle ORM patterns | Must |
| NFR-3.2 | System shall follow existing GQLoom resolver patterns | Must |
| NFR-3.3 | System shall use Effect Schema for type definitions | Must |
| NFR-3.4 | System shall store tags in the Library Durable Object | Must |

### NFR-4: Validation

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-4.1 | Tag name shall be non-empty string | Must |
| NFR-4.2 | Tag color shall be valid 6-character hex format | Must |
| NFR-4.3 | Story ID and Tag ID shall exist before creating association | Must |

## Data Model Requirements

### Tag Entity

```
Tag {
  id: string        // Primary key, prefixed "tag_"
  name: string      // Required, unique per user (case-insensitive)
  color: string     // Required, 6-char hex (e.g., "ff5733")
  createdAt: Date   // Auto-generated timestamp
}
```

### StoryTag Junction

```
StoryTag {
  storyId: string   // FK -> Story.id
  tagId: string     // FK -> Tag.id
  // Composite PK: (storyId, tagId)
}
```

## API Contract Summary

### Library DO Methods

| Method | Input | Output |
|--------|-------|--------|
| `createTag` | `name: string, color: string` | `Tag` |
| `updateTag` | `id: string, name?: string, color?: string` | `Tag` |
| `deleteTag` | `id: string` | `void` |
| `listTags` | none | `Tag[]` |
| `tagStory` | `storyId: string, tagIds: string[]` | `void` |
| `untagStory` | `storyId: string, tagIds: string[]` | `void` |
| `getTagsForStory` | `storyId: string` | `Tag[]` |
| `getStoriesByTag` | `tagId: string` | `Story[]` |

## Error Cases

| Error | Condition | Response |
|-------|-----------|----------|
| `TagNameExists` | Creating/updating tag with duplicate name | 400 with error message |
| `TagNotFound` | Operating on non-existent tag ID | 404 with error message |
| `StoryNotFound` | Tagging non-existent story | 404 with error message |
| `InvalidColor` | Color not matching hex format | 400 with validation error |
| `Unauthorized` | No authenticated user | 401 with auth error |

## Traceability Matrix

| User Story | Requirements |
|------------|--------------|
| Create tags | FR-1.1, FR-1.2, FR-4.1, NFR-4.1, NFR-4.2 |
| Edit tags | FR-1.3, FR-4.2 |
| Delete tags | FR-1.4, FR-1.5, FR-4.3 |
| View tags | FR-1.6, FR-4.4 |
| Tag stories | FR-2.1, FR-2.3, FR-4.5 |
| Remove tags from stories | FR-2.2, FR-4.6 |
| Filter by tag | FR-3.1, FR-3.2, FR-4.8 |
| See tags on stories | FR-2.4, FR-3.3, FR-4.7 |
