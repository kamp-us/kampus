# @kampus/spellbook: Instructions

## Feature Overview

Create `@kampus/spellbook` - an Effect infrastructure toolkit for Cloudflare Durable Objects. Provides composable layers that domain services build on top of.

### Philosophy

> "Spellbook is a toolkit of Effect layers for Cloudflare, not a framework that hides Effect."

Like Rails:
- Embraces the language (Effect idioms: layers, services, tags)
- Provides conventions (how to structure a DO feature)
- Gives tools, not magic (visible, composable layers)
- Has opinions (baked into layers, not hidden abstractions)

### Why

The old `Spellbook.make()` pattern hid too much:
- Users couldn't customize layer composition
- Magic error wrapping violated Effect idioms
- Hard to test in isolation
- Opaque when debugging

New approach: users write their own DO class, compose Spellbook layers explicitly.

## User Stories

**As an Effect developer building on Cloudflare DOs**, I want:

1. **SqlClient layer** - Pre-configured for DO storage.sql with camelCase ↔ snake_case transforms
2. **Drizzle layer** - SqliteDrizzle integration for type-safe queries
3. **KeyValueStore layer** - `@effect/platform` KeyValueStore backed by DO storage
4. **DurableObjectCtx tag** - Generic Context.Tag for `DurableObjectState` (apps define their own `DurableObjectEnv`)
5. **Migration helper** - Effect-returning `runMigrations()` that wraps `blockConcurrencyWhile`
6. **RPC handler helper** - `handleRpc()` to reduce fetch boilerplate (optional)

## Acceptance Criteria

- [ ] `packages/spellbook/` package exists with proper tsconfig/exports
- [ ] `SqlClient.ts` - layer providing `SqlClient.SqlClient` configured for DO
- [ ] `Drizzle.ts` - layer providing `SqliteDrizzle`
- [ ] `KeyValueStore.ts` - layer providing `KeyValueStore.KeyValueStore` (move from worker)
- [ ] `DurableObjectCtx.ts` - Context.Tag for `DurableObjectState` (generic Cloudflare type)
- [ ] `Migrations.ts` - `runMigrations()` helper returning Effect
- [ ] `index.ts` - re-exports all modules
- [ ] Package builds and typechecks
- [ ] Can be imported from `apps/worker`
- [ ] Pasaport or Library DO can use Spellbook layers (proof of concept)

## Constraints

- **Flat file structure** - One file per export, no nested folders
- **Effect-returning helpers** - All helpers return Effect, not Promise
- **Internal package** - `@kampus/spellbook`, not published to npm
- **No breaking changes yet** - Old `Spellbook.make()` can coexist during migration

## Dependencies

- `@effect/sql` - SqlClient abstraction
- `@effect/sql-sqlite-do` - DO SqlStorage wrapper
- `@effect/sql-drizzle` - Drizzle integration
- `@effect/platform` - KeyValueStore interface
- `effect` - Core Effect library

## Conventions

### DurableObjectCtx vs DurableObjectEnv

- **`DurableObjectCtx`** → Lives in `@kampus/spellbook`
  - Uses generic `DurableObjectState` from Cloudflare
  - Not app-specific

- **`DurableObjectEnv`** → Apps define their own
  - `Env` type is app-specific (contains bindings like `LIBRARY`, `PASAPORT`, etc.)
  - Each app creates: `class DurableObjectEnv extends Context.Tag("DO/Env")<DurableObjectEnv, Env>() {}`

This split keeps the package generic while allowing apps to have typed access to their specific bindings.

## Out of Scope

- Removing old `Spellbook.make()` (separate migration task)
- Queue/Scheduler services (deferred)
- WorkerEntrypoint utilities (future)
- Publishing to npm

## Reference

**Layer architecture:**
```
Feature Layer (PasaportLive - RPC adapter)
    ↓ requires Pasaport
Domain Layer (Pasaport.layerBetterAuth - business logic)
    ↓ requires BetterAuth, SqlClient
Infrastructure Layer (@kampus/spellbook)
    └── SqlClient, Drizzle, KeyValueStore, DO context
```

**Usage example:**
```typescript
// From @kampus/spellbook
import {
  SqlClient, Drizzle, KeyValueStore,
  DurableObjectCtx, runMigrations
} from "@kampus/spellbook"

// App-specific (defined in apps/worker)
import {DurableObjectEnv} from "../services"

const spellbook = Layer.mergeAll(
  SqlClient.layer({db: ctx.storage.sql}),
  Drizzle.layer,
  KeyValueStore.layer,
  Layer.succeed(DurableObjectCtx, ctx),
  Layer.succeed(DurableObjectEnv, env),  // App provides this
)

const app = PasaportLive.pipe(
  Layer.provide(Pasaport.layerBetterAuth),
  Layer.provide(BetterAuth.layer),
  Layer.provide(spellbook),
)

this.runtime = ManagedRuntime.make(app)
```
