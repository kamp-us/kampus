# @kampus/spellbook: Implementation Plan

## Current State

| Item | Status |
|------|--------|
| `packages/spellbook/` | ✅ Exists |
| `package.json` | ⚠️ Missing deps |
| `src/index.ts` | ❌ Empty |
| Module files | ❌ Not created |

## Implementation Tasks

### Task 1: Update package.json

Add missing dependencies:

```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.20250204.0",
    "@effect/platform": "catalog:",
    "@effect/rpc": "catalog:",
    "@effect/sql": "catalog:",
    "@effect/sql-drizzle": "catalog:",
    "@effect/sql-sqlite-do": "catalog:",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  }
}
```

---

### Task 2: Create DurableObjectCtx.ts

Source: Extract from `apps/worker/src/services/DurableObjectServices.ts`

```typescript
// packages/spellbook/src/DurableObjectCtx.ts
import {Context} from "effect"
import type {DurableObjectState} from "@cloudflare/workers-types/experimental"

export class DurableObjectCtx extends Context.Tag(
  "@kampus/spellbook/DurableObjectCtx"
)<DurableObjectCtx, DurableObjectState>() {}
```

**Note:** Tag ID changes from `"DO/Ctx"` to `"@kampus/spellbook/DurableObjectCtx"` (namespaced).

---

### Task 3: Create SqlClient.ts

Source: Extract from `apps/worker/src/shared/Spellbook.ts` lines 93-97

```typescript
// packages/spellbook/src/SqlClient.ts
import {SqliteClient} from "@effect/sql-sqlite-do"
import {String as EffectString} from "effect"
import type {SqlStorage} from "@cloudflare/workers-types/experimental"

export interface Config {
  readonly db: SqlStorage
}

export const layer = (config: Config) =>
  SqliteClient.layer({
    db: config.db,
    transformQueryNames: EffectString.camelToSnake,
    transformResultNames: EffectString.snakeToCamel,
  })
```

---

### Task 4: Create Drizzle.ts

Source: Extract from `apps/worker/src/shared/Spellbook.ts` line 99

```typescript
// packages/spellbook/src/Drizzle.ts
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"

export const layer = SqliteDrizzle.layer
```

---

### Task 5: Create KeyValueStore.ts

Source: Move from `apps/worker/src/shared/SpellbookKeyValueStore.ts`

- Update import: `DurableObjectCtx` from `"./DurableObjectCtx"` (local)
- File already matches design spec

---

### Task 6: Create Migrations.ts

Source: Extract from `apps/worker/src/shared/Spellbook.ts` lines 14-18, 124-127

```typescript
// packages/spellbook/src/Migrations.ts
import {Effect} from "effect"
import {drizzle} from "drizzle-orm/durable-sqlite"
import {migrate} from "drizzle-orm/durable-sqlite/migrator"
import type {DurableObjectStorage} from "@cloudflare/workers-types/experimental"

export interface DrizzleMigrations {
  journal: {
    entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>
  }
  migrations: Record<string, string>
}

export const runMigrations = (
  storage: DurableObjectStorage,
  migrations: DrizzleMigrations,
): Effect.Effect<void> =>
  Effect.promise(() =>
    storage.blockConcurrencyWhile(async () => {
      const db = drizzle(storage)
      migrate(db, migrations)
    })
  )
```

---

### Task 7: Create RpcHandler.ts (Optional)

Source: Extract from `apps/worker/src/shared/Spellbook.ts` lines 130-143

```typescript
// packages/spellbook/src/RpcHandler.ts
import {HttpServerRequest, HttpServerResponse} from "@effect/platform"
import type {Rpc, RpcGroup} from "@effect/rpc"
import {RpcServer} from "@effect/rpc"
import {Effect} from "effect"

export const handleRpc = <R extends Rpc.Any>(
  rpcs: RpcGroup.RpcGroup<R>,
  request: Request,
): Effect.Effect<Response, never, RpcGroup.Rpcs<R>> =>
  Effect.gen(function* () {
    const httpApp = yield* RpcServer.toHttpApp(rpcs)
    const response = yield* httpApp.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request),
      ),
    )
    return HttpServerResponse.toWeb(response)
  })
```

---

### Task 8: Create index.ts

```typescript
// packages/spellbook/src/index.ts

// Layers
export * as SqlClient from "./SqlClient"
export * as Drizzle from "./Drizzle"
export * as KeyValueStore from "./KeyValueStore"

// Context Tags
export {DurableObjectCtx} from "./DurableObjectCtx"

// Helpers
export {runMigrations, type DrizzleMigrations} from "./Migrations"
export {handleRpc} from "./RpcHandler"

// Re-export Cloudflare types for convenience
export type {
  SqlStorage,
  DurableObjectStorage,
  DurableObjectState,
} from "@cloudflare/workers-types/experimental"
```

---

### Task 9: Verify Build

```bash
cd packages/spellbook && pnpm tsc --noEmit
```

---

### Task 10: Update apps/worker (Migration)

1. Update `apps/worker/src/services/DurableObjectServices.ts`:
   - Keep `DurableObjectEnv` (app-specific)
   - Re-export `DurableObjectCtx` from `@kampus/spellbook`

2. Update `apps/worker/src/services/index.ts`:
   - Export both tags

3. Delete `apps/worker/src/shared/SpellbookKeyValueStore.ts`

4. Existing `Spellbook.make()` can coexist - no immediate changes needed

---

## File Dependency Order

```
1. DurableObjectCtx.ts  (no deps)
2. SqlClient.ts         (no deps)
3. Drizzle.ts           (no deps)
4. KeyValueStore.ts     (depends on DurableObjectCtx)
5. Migrations.ts        (no deps)
6. RpcHandler.ts        (no deps)
7. index.ts             (depends on all)
```

---

## Verification Checklist

- [ ] `pnpm tsc --noEmit` passes in `packages/spellbook`
- [ ] `pnpm turbo run typecheck` passes workspace-wide
- [ ] Can import `@kampus/spellbook` from `apps/worker`
- [ ] Existing Pasaport/Library DOs still work

---

## Out of Scope (Future)

- Remove old `Spellbook.make()` (separate migration)
- Migrate Pasaport DO to new layer composition pattern
- Add tests for spellbook layers
