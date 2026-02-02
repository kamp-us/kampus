# Spellbook KeyValueStore - Design

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's DO Class                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ layer = RpcLayer.pipe(                                │  │
│  │   Layer.provide(SqliteClient.layer(...)),             │  │
│  │   Layer.provideMerge(SpellbookKeyValueStore.layer),   │  │
│  │ )                                                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              SpellbookKeyValueStore.layer                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Layer.effect(KeyValueStore.KeyValueStore, ...)        │  │
│  │   requires: DurableObjectCtx                          │  │
│  │   provides: KeyValueStore.KeyValueStore               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ctx.storage (DO API)                      │
│  get<T>(key) | put(key, value) | delete(key) | list() | deleteAll()  │
└─────────────────────────────────────────────────────────────┘
```

---

## File Location

```
apps/worker/src/shared/SpellbookKeyValueStore.ts
```

Alongside `Spellbook.ts` in the shared utilities folder.

---

## Implementation

### Layer Definition

```typescript
import {KeyValueStore, PlatformError} from "@effect/platform"
import {Effect, Layer, Option} from "effect"
import {DurableObjectCtx} from "../services"

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
      get: (key) => ...,
      getUint8Array: (key) => ...,
      set: (key, value) => ...,
      remove: (key) => ...,
      clear: ...,
      size: ...,
    })
  })
)
```

### Method Implementations

| Method | Implementation |
|--------|----------------|
| `get(key)` | `storage.get<string>(key)` → `Option.fromNullable` |
| `getUint8Array(key)` | `storage.get<ArrayBuffer>(key)` → `new Uint8Array(buffer)` |
| `set(key, value)` | `storage.put(key, value)` |
| `remove(key)` | `storage.delete(key)` |
| `clear` | `storage.deleteAll()` |
| `size` | `storage.list()` → `.size` |

### Error Handling

All storage operations wrapped in `Effect.tryPromise`:

```typescript
Effect.tryPromise({
  try: () => storage.get(key),
  catch: (error) =>
    PlatformError.SystemError({
      reason: "Unknown",
      module: "KeyValueStore",
      method: "get",
      message: String(error),
    }),
})
```

### Binary Data Handling

DO storage returns `ArrayBuffer`, but KeyValueStore expects `Uint8Array`:

```typescript
getUint8Array: (key) =>
  Effect.tryPromise({
    try: async () => {
      const buffer = await storage.get<ArrayBuffer>(key)
      return Option.fromNullable(
        buffer ? new Uint8Array(buffer) : undefined
      )
    },
    catch: (e) => makeError("getUint8Array", String(e)),
  }),
```

For `set`, both `string` and `Uint8Array` pass through directly — DO storage handles both.

---

## Usage Pattern

### In DO Class (Manual Layer Composition)

```typescript
// features/library/Library.ts
import {SpellbookKeyValueStore} from "../../shared/SpellbookKeyValueStore"

export class Library extends DurableObject<Env> {
  layer = RpcLayer.pipe(
    Layer.provide(SqliteClient.layer({db: this.ctx.storage.sql})),
    Layer.provideMerge(SpellbookKeyValueStore.layer),
  )

  runtime = ManagedRuntime.make(this.layer)
  // ...
}
```

### In Handlers

```typescript
// features/library/handlers.ts
import {KeyValueStore} from "@effect/platform"
import {Effect, Option} from "effect"

export const getCachedStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore

    const cached = yield* kv.get(`story:${id}`)
    if (Option.isSome(cached)) {
      return JSON.parse(cached.value)
    }

    // fetch from SQL, cache, return...
  })
```

### With Schema (Typed Storage)

```typescript
import {KeyValueStore} from "@effect/platform"
import {Schema} from "effect"

const StoryCache = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  fetchedAt: Schema.Date,
})

export const getCachedStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore
    const cache = kv.forSchema(StoryCache)

    const cached = yield* cache.get(`story:${id}`)
    // cached is Option<StoryCache> — fully typed!
  })
```

---

## Design Decisions

### Why `Layer.effect` not `Layer.succeed`?

We need to access `DurableObjectCtx` which requires running an Effect. `Layer.effect` lets us `yield*` the context service.

### Why not integrate into `Spellbook.make()`?

Opt-in is better:
- Not all DOs need KV storage
- Keeps Spellbook.make() simple
- Users explicitly declare dependencies
- Follows Effect's composition-over-configuration philosophy

### Why wrap with `KeyValueStore.make()`?

`KeyValueStore.make()` auto-derives optional methods:
- `has(key)` — derived from `get`
- `isEmpty` — derived from `size`
- `modify(key, f)` — derived from `get` + `set`
- `forSchema(schema)` — wraps with JSON serialization

We implement 6 methods, users get 10+ for free.

---

## Testing Strategy

Uses `@effect/vitest` for cleaner Effect-native testing.

### Test File Location

```
apps/worker/test/spellbook-keyvaluestore.spec.ts
```

### Mock DurableObjectCtx

```typescript
import {Layer} from "effect"
import {DurableObjectCtx} from "../src/services"

const makeMockStorage = () => {
  const store = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key: string, value: unknown) => { store.set(key, value) },
    delete: async (key: string) => store.delete(key),
    deleteAll: async () => { store.clear() },
    list: async () => store,
  }
}

const MockDurableObjectCtx = Layer.succeed(
  DurableObjectCtx,
  {storage: makeMockStorage()} as unknown as DurableObjectState
)
```

### Test Cases (using @effect/vitest)

```typescript
import {KeyValueStore} from "@effect/platform"
import {assert, it} from "@effect/vitest"
import {Effect, Layer, Option, Schema} from "effect"
import {layer} from "../src/shared/SpellbookKeyValueStore"
import {DurableObjectCtx} from "../src/services"

// Fresh storage per test
const makeTestLayer = () => {
  const store = new Map<string, unknown>()
  const mockStorage = {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key: string, value: unknown) => { store.set(key, value) },
    delete: async (key: string) => store.delete(key),
    deleteAll: async () => { store.clear() },
    list: async () => store,
  }
  return layer.pipe(
    Layer.provide(Layer.succeed(DurableObjectCtx, {storage: mockStorage} as any))
  )
}

it.layer(makeTestLayer)("SpellbookKeyValueStore", (it) => {
  it.effect("get returns None for missing key", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const result = yield* kv.get("missing")
      assert.isTrue(Option.isNone(result))
    })
  )

  it.effect("set then get returns value", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      yield* kv.set("key", "value")
      const result = yield* kv.get("key")
      assert.isTrue(Option.isSome(result))
      if (Option.isSome(result)) {
        assert.strictEqual(result.value, "value")
      }
    })
  )

  it.effect("remove deletes key", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      yield* kv.set("key", "value")
      yield* kv.remove("key")
      const result = yield* kv.get("key")
      assert.isTrue(Option.isNone(result))
    })
  )

  it.effect("size returns count", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      yield* kv.set("a", "1")
      yield* kv.set("b", "2")
      const size = yield* kv.size
      assert.strictEqual(size, 2)
    })
  )

  it.effect("clear removes all keys", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      yield* kv.set("a", "1")
      yield* kv.set("b", "2")
      yield* kv.clear
      const size = yield* kv.size
      assert.strictEqual(size, 0)
    })
  )

  it.effect("binary data round-trips", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const input = new Uint8Array([1, 2, 3, 4])
      yield* kv.set("binary", input)
      const result = yield* kv.getUint8Array("binary")
      assert.isTrue(Option.isSome(result))
      if (Option.isSome(result)) {
        assert.deepStrictEqual(Array.from(result.value), [1, 2, 3, 4])
      }
    })
  )

  it.effect("forSchema works with typed data", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const schema = Schema.Struct({name: Schema.String, count: Schema.Number})
      const typed = kv.forSchema(schema)
      yield* typed.set("data", {name: "test", count: 42})
      const result = yield* typed.get("data")
      assert.isTrue(Option.isSome(result))
      if (Option.isSome(result)) {
        assert.deepStrictEqual(result.value, {name: "test", count: 42})
      }
    })
  )

  it.effect("has returns true for existing key", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      yield* kv.set("key", "value")
      const exists = yield* kv.has("key")
      assert.isTrue(exists)
    })
  )

  it.effect("isEmpty returns true when empty", () =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const empty = yield* kv.isEmpty
      assert.isTrue(empty)
    })
  )
})
```

### Dependencies

Add `@effect/vitest` if not present:

```bash
pnpm add -D @effect/vitest --filter @kampus/worker
```

### Run Tests

```bash
turbo run test --filter=@kampus/worker
```

---

## Dependencies

No new dependencies. Uses existing:
- `@effect/platform` (already in project)
- `effect` (already in project)
- `DurableObjectCtx` service (already exists)
