# Library Tags - Technical Design

Technical design derived from [requirements.md](./requirements.md).

## Architecture Decision

**Decision:** Tags and story-tag relationships live in the Library Durable Object.

**Rationale:**
- KISS & YAGNI - no need for separate TagRegistry DO
- Tags are per-user, same partition key as Library
- Transactional consistency for tagging operations
- Simpler queries (joins within single SQLite)

## Database Schema

### New Tables

Add to `apps/worker/src/features/library/drizzle/drizzle.schema.ts`:

```typescript
export const tag = sqliteTable(
  "tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => id("tag")),

    name: text("name").notNull(),
    color: text("color").notNull(), // 6-char hex, e.g. "ff5733"

    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_tag_name").on(table.name),
  ],
);

export const storyTag = sqliteTable(
  "story_tag",
  {
    storyId: text("story_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (table) => [
    primaryKey({columns: [table.storyId, table.tagId]}),
    index("idx_story_tag_story_id").on(table.storyId),
    index("idx_story_tag_tag_id").on(table.tagId),
  ],
);
```

### Schema Notes

- `tag.name` indexed for uniqueness checks (case-insensitive done in code)
- `storyTag` uses composite primary key (no separate id)
- Both foreign key columns indexed for efficient lookups in either direction
- No actual FK constraints (SQLite in DO doesn't enforce them well) - handled in application code

## Library DO Methods

### Type Definitions

Add to `apps/worker/src/features/library/schema.ts`:

```typescript
import {Schema} from "effect";

export const Tag = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  createdAt: Schema.Date,
});
export type Tag = Schema.Schema.Type<typeof Tag>;

export const CreateTagInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  color: Schema.String.pipe(Schema.pattern(/^[0-9a-fA-F]{6}$/)),
});

export const UpdateTagInput = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  color: Schema.optional(Schema.String.pipe(Schema.pattern(/^[0-9a-fA-F]{6}$/))),
});
```

### Error Types

```typescript
import {Data} from "effect";

export class TagNotFoundError extends Data.TaggedError("TagNotFoundError")<{
  tagId: string;
}> {}

export class TagNameExistsError extends Data.TaggedError("TagNameExistsError")<{
  name: string;
}> {}

export class StoryNotFoundError extends Data.TaggedError("StoryNotFoundError")<{
  storyId: string;
}> {}

export class InvalidColorError extends Data.TaggedError("InvalidColorError")<{
  color: string;
}> {}
```

### Method Signatures

Add to `apps/worker/src/features/library/Library.ts`:

```typescript
// Tag CRUD
async createTag(name: string, color: string): Promise<Tag>
async updateTag(id: string, updates: {name?: string; color?: string}): Promise<Tag>
async deleteTag(id: string): Promise<void>
async listTags(): Promise<Tag[]>
async getTag(id: string): Promise<Tag | null>

// Story-Tag relationships
async tagStory(storyId: string, tagIds: string[]): Promise<void>
async untagStory(storyId: string, tagIds: string[]): Promise<void>
async getTagsForStory(storyId: string): Promise<Tag[]>
async getStoriesByTag(tagId: string): Promise<Story[]>
```

## Implementation Details

### createTag

```typescript
async createTag(name: string, color: string) {
  // Check uniqueness (case-insensitive)
  const existing = await this.db
    .select()
    .from(schema.tag)
    .where(sql`lower(${schema.tag.name}) = lower(${name})`)
    .get();

  if (existing) {
    throw new TagNameExistsError({name});
  }

  const [tag] = await this.db
    .insert(schema.tag)
    .values({name, color: color.toLowerCase()})
    .returning();

  return tag;
}
```

### deleteTag (with cascade)

```typescript
async deleteTag(id: string) {
  const tag = await this.db
    .select()
    .from(schema.tag)
    .where(eq(schema.tag.id, id))
    .get();

  if (!tag) {
    throw new TagNotFoundError({tagId: id});
  }

  // Delete associations first, then tag
  await this.db.delete(schema.storyTag).where(eq(schema.storyTag.tagId, id));
  await this.db.delete(schema.tag).where(eq(schema.tag.id, id));
}
```

### tagStory (idempotent)

```typescript
async tagStory(storyId: string, tagIds: string[]) {
  // Verify story exists
  const story = await this.db
    .select()
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
    .get();

  if (!story) {
    throw new StoryNotFoundError({storyId});
  }

  // Insert with ON CONFLICT DO NOTHING for idempotency
  for (const tagId of tagIds) {
    await this.db
      .insert(schema.storyTag)
      .values({storyId, tagId})
      .onConflictDoNothing();
  }
}
```

### getTagsForStory (join query)

```typescript
async getTagsForStory(storyId: string) {
  const results = await this.db
    .select({
      id: schema.tag.id,
      name: schema.tag.name,
      color: schema.tag.color,
      createdAt: schema.tag.createdAt,
    })
    .from(schema.storyTag)
    .innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
    .where(eq(schema.storyTag.storyId, storyId));

  return results;
}
```

### getStoriesByTag

```typescript
async getStoriesByTag(tagId: string) {
  const results = await this.db
    .select({
      id: schema.story.id,
      url: schema.story.url,
      normalizedUrl: schema.story.normalizedUrl,
      title: schema.story.title,
      description: schema.story.description,
      createdAt: schema.story.createdAt,
    })
    .from(schema.storyTag)
    .innerJoin(schema.story, eq(schema.storyTag.storyId, schema.story.id))
    .where(eq(schema.storyTag.tagId, tagId));

  return results;
}
```

## Migration Strategy

1. Generate new migration:
   ```bash
   pnpm --filter worker exec drizzle-kit generate --config=./src/features/library/drizzle/drizzle.config.ts
   ```
2. Migration adds `tag` and `story_tag` tables
3. No data migration needed (new tables are empty)
4. Existing stories unaffected

## File Changes Summary

| File | Change |
|------|--------|
| `apps/worker/src/features/library/drizzle/drizzle.schema.ts` | Add `tag` and `storyTag` tables |
| `apps/worker/src/features/library/drizzle/migrations/` | New migration SQL |
| `apps/worker/src/features/library/schema.ts` | Add Tag types and error classes |
| `apps/worker/src/features/library/Library.ts` | Add 8 new methods |
| `apps/worker/test/library-tags.spec.ts` | New test file |

## Testing Strategy

### Unit Tests

1. **Tag CRUD**
   - Create tag with valid name/color
   - Reject duplicate tag names (case-insensitive)
   - Reject invalid color format
   - Update tag name and/or color
   - Delete tag cascades to story_tag

2. **Story Tagging**
   - Tag story with single tag
   - Tag story with multiple tags
   - Idempotent tagging (no duplicates)
   - Untag removes association
   - Tagging non-existent story fails

3. **Queries**
   - Get tags for story returns correct tags
   - Get stories by tag returns correct stories
   - Empty results when no associations

### Test Pattern

```typescript
import {env} from "cloudflare:test";
import {describe, it, expect} from "vitest";

describe("Library Tags", () => {
  it("creates a tag", async () => {
    const library = env.LIBRARY.get(env.LIBRARY.idFromName("test-user"));
    const tag = await library.createTag("javascript", "f7df1e");

    expect(tag.id).toMatch(/^tag_/);
    expect(tag.name).toBe("javascript");
    expect(tag.color).toBe("f7df1e");
  });
});
```
