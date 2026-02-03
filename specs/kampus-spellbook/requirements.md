# @kampus/spellbook: Requirements

## Functional Requirements

### FR-1: SqlClient Layer

Provide a layer that creates `SqlClient.SqlClient` configured for DO storage.

| Aspect | Requirement |
|--------|-------------|
| Input | `{db: SqlStorage}` from `ctx.storage.sql` |
| Output | `Layer<SqlClient.SqlClient, never, never>` |
| Transforms | camelCase ↔ snake_case (query names and result names) |
| Based on | `@effect/sql-sqlite-do` `SqliteClient.layer` |

```typescript
export const layer = (config: {db: SqlStorage}) =>
  SqliteClient.layer({
    db: config.db,
    transformQueryNames: String.camelToSnake,
    transformResultNames: String.snakeToCamel,
  })
```

### FR-2: Drizzle Layer

Provide a layer for `SqliteDrizzle` integration.

| Aspect | Requirement |
|--------|-------------|
| Output | `Layer<SqliteDrizzle, never, SqlClient.SqlClient>` |
| Requires | `SqlClient.SqlClient` (from FR-1) |
| Based on | `@effect/sql-drizzle/Sqlite` |

```typescript
export const layer: Layer<SqliteDrizzle, never, SqlClient.SqlClient> =
  SqliteDrizzle.layer
```

### FR-3: KeyValueStore Layer

Provide `@effect/platform` KeyValueStore backed by DO storage.

| Aspect | Requirement |
|--------|-------------|
| Output | `Layer<KeyValueStore.KeyValueStore, never, DurableObjectCtx>` |
| Requires | `DurableObjectCtx` |
| Methods | get, getUint8Array, set, remove, clear, size |
| Errors | `PlatformError.SystemError` |

> Note: Already implemented in `apps/worker/src/shared/SpellbookKeyValueStore.ts`. Move to package.

### FR-4: DurableObjectCtx Tag

Provide Context.Tag for DO state access.

| Aspect | Requirement |
|--------|-------------|
| Type | `Context.Tag<DurableObjectCtx, DurableObjectState>` |
| Tag ID | `"@kampus/spellbook/DurableObjectCtx"` |

```typescript
export class DurableObjectCtx extends Context.Tag(
  "@kampus/spellbook/DurableObjectCtx"
)<DurableObjectCtx, DurableObjectState>() {}
```

### FR-5: Migrations Helper

Provide Effect-returning helper for running Drizzle migrations.

| Aspect | Requirement |
|--------|-------------|
| Signature | `(storage: DurableObjectStorage, migrations: DrizzleMigrations) => Effect<void>` |
| Behavior | Wraps `blockConcurrencyWhile` with `migrate()` |
| Returns | `Effect<void, never, never>` |

```typescript
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

### FR-6: RPC Handler Helper (Optional)

Provide helper to reduce RPC fetch boilerplate.

| Aspect | Requirement |
|--------|-------------|
| Signature | `<R>(rpcs: RpcGroup<R>, request: Request) => Effect<Response>` |
| Behavior | `RpcServer.toHttpApp` → provide request → convert response |

```typescript
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

## Non-Functional Requirements

### NFR-1: Package Structure

```
packages/spellbook/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Re-exports
│   ├── SqlClient.ts       # FR-1
│   ├── Drizzle.ts         # FR-2
│   ├── KeyValueStore.ts   # FR-3
│   ├── DurableObjectCtx.ts # FR-4
│   ├── Migrations.ts      # FR-5
│   └── RpcHandler.ts      # FR-6 (optional)
```

### NFR-2: Flat File Structure

One export per file. No nested folders.

### NFR-3: TypeScript Configuration

- Extends base tsconfig from workspace
- Composite project for incremental builds
- Exports ESM

### NFR-4: Package Exports

```json
{
  "name": "@kampus/spellbook",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

---

## Conventions

### C-1: DurableObjectCtx vs DurableObjectEnv

| Tag | Location | Reason |
|-----|----------|--------|
| `DurableObjectCtx` | `@kampus/spellbook` | Generic Cloudflare type |
| `DurableObjectEnv` | App-defined | App-specific `Env` bindings |

### C-2: Layer Dependencies

Layers should have minimal dependencies:
- `SqlClient.layer` → no dependencies (takes config)
- `Drizzle.layer` → requires `SqlClient.SqlClient`
- `KeyValueStore.layer` → requires `DurableObjectCtx`

### C-3: Error Handling

- SqlClient errors → defects (embedded DB shouldn't fail)
- KeyValueStore errors → `PlatformError.SystemError`

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@effect/sql` | SqlClient abstraction |
| `@effect/sql-sqlite-do` | DO SqlStorage wrapper |
| `@effect/sql-drizzle` | Drizzle integration |
| `@effect/platform` | KeyValueStore interface |
| `@effect/rpc` | RPC handler helper |
| `effect` | Core |
| `drizzle-orm` | Migrations |
