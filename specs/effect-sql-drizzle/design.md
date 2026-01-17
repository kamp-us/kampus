# Design: @effect/sql-drizzle Migration

## Problem Statement

Current pattern has schema duplication:

```
drizzle.schema.ts (source of truth for migrations)
    ↓ duplicated in
models.ts (Model.Class for repositories)
    ↓ used by
handlers.ts (mix of repo calls + raw SQL)
```

## Solution

Use @effect/sql-drizzle to make Drizzle queries yieldable:

```
drizzle.schema.ts (single source of truth)
    ↓ passed to
Spellbook.make({ schema })
    ↓ provides
SqliteDrizzle service
    ↓ used by
handlers.ts (pure Drizzle queries)
```

## Key Insight

@effect/sql-drizzle patches Drizzle's QueryPromise:

```typescript
// From @effect/sql-drizzle/Sqlite.ts
declare module "drizzle-orm" {
  export interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}
patch(QueryPromise.prototype)
```

This means Drizzle queries can be yielded directly:

```typescript
const db = yield* SqliteDrizzle
const stories = yield* db.select().from(schema.story)  // Effect!
```

## Architecture

### Spellbook Changes

```typescript
// Spellbook.ts
import { SqliteDrizzle, make as makeDrizzle } from "@effect/sql-drizzle/Sqlite"

export interface MakeConfig<R extends Rpc.Any, TSchema extends Record<string, unknown>> {
  readonly rpcs: RpcGroup.RpcGroup<R>
  readonly handlers: RpcGroup.HandlersFrom<R>
  readonly migrations: DrizzleMigrations
  readonly schema: TSchema
}

// In constructor:
const drizzleLayer = Layer.effect(
  SqliteDrizzle,
  makeDrizzle({ schema: config.schema })
)

const fullLayer = Layer.provideMerge(
  handlerLayer,
  Layer.mergeAll(doLayer, sqliteLayer, drizzleLayer)
)
```

### Handler Pattern

```typescript
// handlers.ts
import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import * as schema from "./drizzle/drizzle.schema"
import { eq, desc, count, inArray } from "drizzle-orm"

export const handlers = {
  getStory: ({ id }) =>
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle
      const [story] = yield* db
        .select()
        .from(schema.story)
        .where(eq(schema.story.id, id))
      return story ?? null
    }),

  listStories: ({ first, after }) =>
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle
      const limit = first ?? 20

      const [{ total }] = yield* db
        .select({ total: count() })
        .from(schema.story)

      const stories = yield* db
        .select()
        .from(schema.story)
        .orderBy(desc(schema.story.id))
        .limit(limit + 1)

      // ... pagination logic
    }),
}
```

## Files Changed

| File | Change |
|------|--------|
| `apps/worker/package.json` | Add @effect/sql-drizzle |
| `apps/worker/src/shared/Spellbook.ts` | Add schema param, SqliteDrizzle layer |
| `apps/worker/src/features/library/models.ts` | DELETE |
| `apps/worker/src/features/library/handlers.ts` | Migrate to Drizzle |
| `apps/worker/src/features/library/Library.ts` | Pass schema |
| `apps/worker/src/features/web-page-parser/*` | Same pattern |

## Benefits

| Before | After |
|--------|-------|
| 2 schema definitions | 1 schema definition |
| Option wrapping for nulls | Native null |
| Raw SQL for complex queries | Drizzle query builder |
| Manual type annotations | Inferred from schema |
| ~160 lines ceremony | ~10 lines (schema import + layer) |
