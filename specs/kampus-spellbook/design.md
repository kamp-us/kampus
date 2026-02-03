# @kampus/spellbook: Design

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Feature Layer                         │
│  (PasaportLive, LibraryLive - RPC adapters)             │
└─────────────────────────────────────────────────────────┘
                          │ requires
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Domain Layer                          │
│  (Pasaport, BetterAuth - business logic services)       │
└─────────────────────────────────────────────────────────┘
                          │ requires
                          ▼
┌─────────────────────────────────────────────────────────┐
│              @kampus/spellbook (Infrastructure)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐            │
│  │ SqlClient│ │ Drizzle  │ │ KeyValueStore│            │
│  └──────────┘ └──────────┘ └──────────────┘            │
│  ┌─────────────────┐ ┌────────────┐                    │
│  │ DurableObjectCtx│ │ Migrations │                    │
│  └─────────────────┘ └────────────┘                    │
└─────────────────────────────────────────────────────────┘
                          │ uses
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare DO Runtime                       │
│  ctx.storage.sql, ctx.storage, DurableObjectState       │
└─────────────────────────────────────────────────────────┘
```

## Module Design

### SqlClient.ts

```typescript
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

**Design decisions:**
- Takes `SqlStorage` directly, not `DurableObjectState` - more explicit
- camelCase ↔ snake_case transforms baked in (opinionated)
- Returns configured layer, no extra abstraction

### Drizzle.ts

```typescript
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"

export const layer = SqliteDrizzle.layer
```

**Design decisions:**
- Re-export only - no wrapper needed
- Requires `SqlClient.SqlClient` from caller's composition

### KeyValueStore.ts

```typescript
import {KeyValueStore} from "@effect/platform"
import * as PlatformError from "@effect/platform/Error"
import {Effect, Layer, Option} from "effect"
import {DurableObjectCtx} from "./DurableObjectCtx"

const makeError = (method: string, description: string) =>
  new PlatformError.SystemError({
    reason: "Unknown",
    module: "KeyValueStore",
    method,
    description,
  })

export const layer: Layer.Layer<
  KeyValueStore.KeyValueStore,
  never,
  DurableObjectCtx
> = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.gen(function* () {
    const ctx = yield* DurableObjectCtx
    const storage = ctx.storage

    return KeyValueStore.make({
      get: (key) =>
        Effect.tryPromise({
          try: async () => {
            const value = await storage.get<string>(key)
            return Option.fromNullable(value)
          },
          catch: (e) => makeError("get", String(e)),
        }),

      getUint8Array: (key) =>
        Effect.tryPromise({
          try: async () => {
            const buffer = await storage.get<ArrayBuffer>(key)
            return Option.fromNullable(buffer ? new Uint8Array(buffer) : undefined)
          },
          catch: (e) => makeError("getUint8Array", String(e)),
        }),

      set: (key, value) =>
        Effect.tryPromise({
          try: () => storage.put(key, value),
          catch: (e) => makeError("set", String(e)),
        }),

      remove: (key) =>
        Effect.tryPromise({
          try: () => storage.delete(key).then(() => undefined),
          catch: (e) => makeError("remove", String(e)),
        }),

      clear: Effect.tryPromise({
        try: () => storage.deleteAll(),
        catch: (e) => makeError("clear", String(e)),
      }),

      size: Effect.tryPromise({
        try: async () => {
          const map = await storage.list()
          return map.size
        },
        catch: (e) => makeError("size", String(e)),
      }),
    })
  })
)
```

**Design decisions:**
- Uses `KeyValueStore.make()` to get auto-derived methods (has, isEmpty, modify, forSchema)
- Depends on `DurableObjectCtx` for storage access
- Errors mapped to `PlatformError.SystemError`

### DurableObjectCtx.ts

```typescript
import {Context} from "effect"
import type {DurableObjectState} from "@cloudflare/workers-types/experimental"

export class DurableObjectCtx extends Context.Tag(
  "@kampus/spellbook/DurableObjectCtx"
)<DurableObjectCtx, DurableObjectState>() {}
```

**Design decisions:**
- Namespaced tag ID to avoid collisions
- Uses `DurableObjectState` from `@cloudflare/workers-types/experimental`

### Migrations.ts

```typescript
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

**Design decisions:**
- Takes `DurableObjectStorage` directly (from `ctx.storage`)
- Returns `Effect<void>` - caller runs it in constructor
- Wraps `blockConcurrencyWhile` internally

### RpcHandler.ts (Optional)

```typescript
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

**Design decisions:**
- Generic over RPC group type
- Returns `Effect<Response>` - caller runs via runtime
- Requires RPC handlers in context (from layer composition)

### index.ts

```typescript
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

## Package Configuration

### package.json

```json
{
  "name": "@kampus/spellbook",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@cloudflare/workers-types": "^4.0.0",
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

**Note:** Uses `@cloudflare/workers-types` for type imports via `@cloudflare/workers-types/experimental`.

### tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

---

## Usage Example

```typescript
// apps/worker/src/features/pasaport/pasaport.ts
import {DurableObject} from "cloudflare:workers"
import {Layer, ManagedRuntime, Effect} from "effect"
import {RpcSerialization} from "@effect/rpc"
import {
  SqlClient, Drizzle, KeyValueStore,
  DurableObjectCtx, runMigrations, handleRpc
} from "@kampus/spellbook"
import {DurableObjectEnv} from "../../services"  // App-specific
import {PasaportRpcs} from "./rpc"
import {PasaportLive} from "./PasaportLive"
import {Pasaport} from "./services/Pasaport"
import {BetterAuth} from "./services/BetterAuth"
import migrations from "./drizzle/migrations"

export class PasaportDO extends DurableObject<Env> {
  private runtime: ManagedRuntime.ManagedRuntime<any, any>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Infrastructure from @kampus/spellbook
    const infra = Layer.mergeAll(
      SqlClient.layer({db: ctx.storage.sql}),
      Drizzle.layer,
      KeyValueStore.layer,
      Layer.succeed(DurableObjectCtx, ctx),
      Layer.succeed(DurableObjectEnv, env),
    )

    // Application layers
    const app = Layer.mergeAll(
      PasaportLive,
      RpcSerialization.layerJson,
      Layer.scope,
    ).pipe(
      Layer.provide(Pasaport.layerBetterAuth),
      Layer.provide(BetterAuth.Default),
      Layer.provide(infra),
    )

    this.runtime = ManagedRuntime.make(app)

    // Run migrations
    Effect.runPromise(runMigrations(ctx.storage, migrations))
  }

  async fetch(request: Request): Promise<Response> {
    return this.runtime.runPromise(handleRpc(PasaportRpcs, request))
  }
}
```

---

## Testing Strategy

### Unit Tests

Test layers in isolation with mock contexts:

```typescript
import {Effect, Layer} from "effect"
import {KeyValueStore, DurableObjectCtx} from "@kampus/spellbook"

const mockStorage = {
  get: async (key: string) => mockData.get(key),
  put: async (key: string, value: unknown) => { mockData.set(key, value) },
  delete: async (key: string) => mockData.delete(key),
  deleteAll: async () => mockData.clear(),
  list: async () => mockData,
}

const TestLayer = KeyValueStore.layer.pipe(
  Layer.provide(
    Layer.succeed(DurableObjectCtx, {storage: mockStorage} as DurableObjectState)
  )
)

it.effect("KeyValueStore get/set", () =>
  Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore
    yield* kv.set("key", "value")
    const result = yield* kv.get("key")
    expect(result).toEqual(Option.some("value"))
  }).pipe(Effect.provide(TestLayer))
)
```

### Integration Tests

Test with real DO in vitest-pool-workers:

```typescript
import {env, createExecutionContext} from "cloudflare:test"

it("PasaportDO handles RPC", async () => {
  const id = env.PASAPORT.idFromName("test")
  const stub = env.PASAPORT.get(id)
  const response = await stub.fetch(new Request("http://test/rpc", {
    method: "POST",
    body: JSON.stringify({...})
  }))
  expect(response.ok).toBe(true)
})
```

---

## Migration Path

1. **Create package** with layers
2. **Update apps/worker** to import from `@kampus/spellbook`
3. **Keep old Spellbook.make()** temporarily
4. **Migrate one DO** (e.g., Pasaport) to new pattern
5. **Migrate remaining DOs**
6. **Remove old Spellbook.make()** once all migrated
