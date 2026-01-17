# Design: @effect/sql Model Abstraction

## Problem Statement

Current handler pattern mixes JS logic with SQL template literals:

```typescript
// Ugly: manual types, raw SQL, manual date formatting
interface StoryRow {
  id: string;
  created_at: number;
}

const getStory = ({id}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<StoryRow>`SELECT * FROM story WHERE id = ${id}`
  return formatStory(rows[0], tags)  // manual formatting
})
```

**Pain points:**
1. Manual `interface StoryRow` types — no validation, no variants
2. Raw `sql` template literals mixed with business logic
3. Manual date formatting (`new Date(created_at).toISOString()`)
4. Manual Map building for relationship grouping
5. `sql.unsafe()` with string interpolation for IN clauses

## Solution

Adopt `@effect/sql` Model abstraction:
- `Model.Class` — multi-variant schema (select/insert/update/json)
- `Effect.Service` — service with default Layer for repositories
- `SqlSchema` — type-safe query wrappers
- `SqlResolver` — batched queries for N+1 prevention

## Architecture

### File Structure
```
features/library/
├── models.ts      # Model.Class + Effect.Service repos (combined)
├── queries.ts     # SqlSchema/SqlResolver for complex queries
├── handlers.ts    # Pure Effect functions (yield* repos)
├── Library.ts     # Spellbook.make() with RepoLayer
└── drizzle/       # Migrations (unchanged)
```

### Layer Composition
```
Spellbook provides:
├── SqlClient (from SqliteClient.layer)
├── DurableObjectEnv
├── DurableObjectCtx
└── RepoLayer (StoryRepo.Default + TagRepo.Default)
    └── requires SqlClient (satisfied by Spellbook)
```

## Key Decisions

### 1. Effect.Service over Context.Tag

**Chosen:** `Effect.Service` for repository definitions

```typescript
export class StoryRepo extends Effect.Service<StoryRepo>()("StoryRepo", {
  effect: Model.makeRepository(Story, {...}),
}) {}

// Usage
const repo = yield* StoryRepo
RepoLayer = Layer.mergeAll(StoryRepo.Default, TagRepo.Default)
```

**Rationale:** Single definition for Tag + `.Default` Layer, less boilerplate.

### 2. Models + Repos Combined

**Chosen:** `models.ts` contains both Model.Class and Effect.Service definitions

**Rationale:** Related code stays together, simpler imports.

### 3. Queries File for Complex Operations

**Chosen:** Separate `queries.ts` for SqlSchema/SqlResolver wrappers

**Use cases:**
- Pagination queries
- Tag joins (SqlResolver.grouped)
- Any query that doesn't fit CRUD pattern

### 4. Keep Raw SQL for Certain Operations

**Chosen:** Hybrid approach

- **Use Model/Repo:** Simple CRUD (insert, update, findById, delete)
- **Use Raw SQL:** Complex joins, dynamic WHERE, pagination

## Model Definitions

```typescript
// models.ts
import {Model} from "@effect/sql"
import {Effect, Layer, Schema} from "effect"

export class Story extends Model.Class<Story>("Story")({
  id: Model.GeneratedByApp(Schema.String),
  url: Schema.String,
  title: Schema.String,
  description: Model.FieldOption(Schema.String),
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
}) {}

export class Tag extends Model.Class<Tag>("Tag")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  color: Schema.String,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}

export class StoryRepo extends Effect.Service<StoryRepo>()("StoryRepo", {
  effect: Model.makeRepository(Story, {
    tableName: "story",
    spanPrefix: "Story",
    idColumn: "id",
  }),
}) {}

export class TagRepo extends Effect.Service<TagRepo>()("TagRepo", {
  effect: Model.makeRepository(Tag, {
    tableName: "tag",
    spanPrefix: "Tag",
    idColumn: "id",
  }),
}) {}

export const RepoLayer = Layer.mergeAll(StoryRepo.Default, TagRepo.Default)
```

## Handler Pattern (After)

```typescript
// handlers.ts
import {StoryRepo, TagRepo} from "./models"
import {makeTagsByStoryResolver} from "./queries"

export const getStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const storyRepo = yield* StoryRepo
    const story = yield* storyRepo.findById(id)
    if (Option.isNone(story)) return null

    const tagsResolver = yield* makeTagsByStoryResolver
    const tags = yield* tagsResolver.execute(id)
    return {...story.value, tags}
  })

export const createStory = ({url, title, description, tagIds}) =>
  Effect.gen(function* () {
    const storyRepo = yield* StoryRepo
    const story = yield* storyRepo.insert({
      id: id("story"),
      url,
      title,
      description,
    })
    if (tagIds) yield* setStoryTags({storyId: story.id, tagIds})
    return story
  })
```

## Spellbook Changes

```typescript
// Spellbook.ts - add optional layers config
export interface MakeConfig<R extends Rpc.Any> {
  readonly rpcs: RpcGroup.RpcGroup<R>
  readonly handlers: RpcGroup.HandlersFrom<R>
  readonly migrations: DrizzleMigrations
  readonly layers?: Layer.Layer<any, never, SqlClient>  // NEW
}

// In constructor
const repoLayer = config.layers ?? Layer.empty
const fullLayer = Layer.provideMerge(
  handlerLayer,
  Layer.mergeAll(doLayer, sqliteLayer, repoLayer)
)
```

## Benefits

| Before | After |
|--------|-------|
| Manual interfaces | Auto-generated from Model.Class |
| Raw SQL everywhere | Repos for CRUD, queries for complex |
| Manual date formatting | Built-in DateTimeInsertFromNumber |
| No validation | Schema validation at runtime |
| Coupled handlers | Pure Effect functions |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing handlers | Migrate one handler at a time |
| Date format mismatch | Verify DateTimeInsertFromNumber matches current storage |
| Complex pagination | Keep raw SQL for pagination queries |

## Out of Scope

- Migrating Pasaport DO (uses Better Auth, not RPC)
- WebPageParser (already minimal, no complex queries)
- Creating `@kampus/library` package for models
