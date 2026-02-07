# Spellbook KeyValueStore

## Feature Overview

Implement `@effect/platform`'s `KeyValueStore` interface backed by Cloudflare Durable Object storage. This brings Effect's standard key-value abstraction to Spellbook DOs, enabling caching, temporary data storage, and simple lookups without SQL overhead.

## Why This Feature

1. **Standard Effect Interface**: Developers familiar with Effect can use the same `KeyValueStore` API they know from other contexts.

2. **Simpler Than SQL**: For simple key-value operations, going through SqlClient and writing queries is overkill. `kv.set("key", value)` is cleaner.

3. **DO Storage Optimization**: DO's native storage API (`ctx.storage.get/put/delete`) is optimized for key-value access patterns — faster than SQL for simple lookups.

4. **Schema Support Built-in**: `KeyValueStore.forSchema()` provides typed, validated storage without custom code.

## User Stories

### As a Spellbook handler author

- I want to cache expensive computations so I don't recompute them on every request.
- I want to store temporary data that doesn't warrant a SQL table.
- I want to use Effect's standard `KeyValueStore` interface so my code is portable.

### As a Spellbook DO author

- I want to opt-in to KeyValueStore by adding a layer, not have it forced on me.
- I want the implementation to use DO's native storage for optimal performance.

## Acceptance Criteria

1. **Implements Full Interface**: All methods from `@effect/platform`'s `KeyValueStore` work correctly:
   - `get(key)` → `Effect<Option<string>>`
   - `getUint8Array(key)` → `Effect<Option<Uint8Array>>`
   - `set(key, value)` → `Effect<void>`
   - `remove(key)` → `Effect<void>`
   - `clear` → `Effect<void>`
   - `size` → `Effect<number>`
   - `has(key)` → `Effect<boolean>`
   - `isEmpty` → `Effect<boolean>`
   - `modify(key, f)` → `Effect<Option<string>>`
   - `modifyUint8Array(key, f)` → `Effect<Option<Uint8Array>>`
   - `forSchema(schema)` → `SchemaStore<A, R>`

2. **Opt-in Layer**: Provided as a `Layer` that users compose into their Spellbook setup.

3. **Requires DurableObjectCtx**: The layer depends on `DurableObjectCtx` service to access `ctx.storage`.

4. **Error Handling**: Operations that fail produce `PlatformError.SystemError` as per the interface contract.

5. **No SQL Dependency**: Uses DO storage API directly, not SqlClient.

## Constraints

- Must use `@effect/platform`'s `KeyValueStore.make()` helper to ensure interface compliance.
- Must work within Spellbook's existing layer composition pattern.
- Should not pollute the DO's SQL database — uses separate storage namespace.

## Dependencies

- `@effect/platform` (already in project)
- `DurableObjectCtx` service (already exists in `apps/worker/src/services`)

## Out of Scope

- SpellbookState<T> — deferred, SQL tables cover this use case
- SpellbookQueue — deferred, needs more design
- SpellbookScheduler — deferred
- Automatic inclusion in Spellbook.make() — users opt-in explicitly
