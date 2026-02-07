# Spellbook KeyValueStore - Requirements

## Overview

Implement `@effect/platform`'s `KeyValueStore` interface backed by Cloudflare Durable Object storage (`ctx.storage`). Provided as an opt-in Effect Layer.

---

## Functional Requirements

### FR-1: Core KeyValueStore Interface

Implement all methods required by `KeyValueStore.make()`:

| Method | Signature | DO Storage Mapping |
|--------|-----------|-------------------|
| `get` | `(key: string) → Effect<Option<string>>` | `ctx.storage.get<string>(key)` |
| `getUint8Array` | `(key: string) → Effect<Option<Uint8Array>>` | `ctx.storage.get<ArrayBuffer>(key)` → convert |
| `set` | `(key: string, value: string \| Uint8Array) → Effect<void>` | `ctx.storage.put(key, value)` |
| `remove` | `(key: string) → Effect<void>` | `ctx.storage.delete(key)` |
| `clear` | `Effect<void>` | `ctx.storage.deleteAll()` ⚠️ See FR-2 |
| `size` | `Effect<number>` | `ctx.storage.list({prefix}).size` |

**Auto-derived by `KeyValueStore.make()`** (no implementation needed):
- `has(key)` — checks if `get(key)` returns `Some`
- `isEmpty` — checks if `size === 0`
- `modify(key, f)` — read-modify-write pattern
- `modifyUint8Array(key, f)` — binary read-modify-write
- `forSchema(schema)` — returns typed `SchemaStore<A, R>`

### FR-2: Opt-in Layer Export

```typescript
// Exported API
export const layer: Layer.Layer<
  KeyValueStore.KeyValueStore,
  never,
  DurableObjectCtx
>
```

Users compose this into their Spellbook DO's layer stack manually.

### FR-3: Binary Data Support

- `Uint8Array` stored as-is (DO storage supports it natively)
- `ArrayBuffer` from DO storage converted to `Uint8Array` on retrieval
- String values stored as-is

---

## Non-Functional Requirements

### NFR-1: No SQL Dependency

Implementation MUST use `ctx.storage` KV API directly, NOT `ctx.storage.sql`.

### NFR-2: Error Mapping

DO storage errors mapped to `PlatformError.SystemError`:

```typescript
Effect.tryPromise({
  try: () => ctx.storage.get(key),
  catch: (error) => PlatformError.SystemError({
    reason: "Unknown",
    module: "KeyValueStore",
    method: "get",
    message: String(error)
  })
})
```

### NFR-3: Non-blocking

All operations return `Effect`. Use `Effect.promise()` or `Effect.tryPromise()`.

---

## Technical Constraints

### TC-1: Use KeyValueStore.make()

MUST use `@effect/platform`'s `KeyValueStore.make()` to get auto-derived methods.

### TC-2: Depend on DurableObjectCtx

Layer requires `DurableObjectCtx` (already provided by Spellbook).

---

## Usage Example

```typescript
// Library.ts - Opt-in
import {SpellbookKeyValueStore} from "../../shared/SpellbookKeyValueStore"

export class Library extends DurableObject<Env> {
  layer = RpcLayer.pipe(
    Layer.provide(SqliteClient.layer({db: this.ctx.storage.sql})),
    Layer.provideMerge(SpellbookKeyValueStore.layer),  // Opt-in here
  )
}

// handlers.ts - Usage
import {KeyValueStore} from "@effect/platform"

export const getStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore

    // Simple cache
    const cached = yield* kv.get(`story:${id}`)
    if (Option.isSome(cached)) return JSON.parse(cached.value)

    // Typed with schema
    const typedStore = kv.forSchema(StorySchema)
    yield* typedStore.set(`story:${id}`, story)
  })
```

---

## Acceptance Criteria

- [ ] All 6 required methods implemented
- [ ] Auto-derived methods work (has, isEmpty, modify, forSchema)
- [ ] Binary data (Uint8Array) round-trips correctly
- [ ] Errors produce `PlatformError.SystemError`
- [ ] Layer composes in Spellbook DO
- [ ] No SQL dependency
