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

Uses standard vitest with Effect.runPromise for cloudflare workers pool compatibility.

> **Note**: Originally planned to use `@effect/vitest` `it.layer()` pattern, but the cloudflare workers vitest pool has compatibility issues with Effect's layer management. Using standard vitest with a `runTest()` helper instead.

### Test File Location

```
apps/worker/test/spellbook-keyvaluestore.spec.ts
```

### Mock DurableObjectCtx

```typescript
import {Effect, Layer, Option, Schema} from "effect"
import {describe, expect, it} from "vitest"
import {DurableObjectCtx} from "../src/services"
import {layer} from "../src/shared/SpellbookKeyValueStore"

// Fresh storage per test - each call creates isolated Map
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
    Layer.provide(
      Layer.succeed(DurableObjectCtx, {storage: mockStorage} as unknown as DurableObjectState)
    )
  )
}

// Helper for running Effect tests with fresh layer
const runTest = <A, E>(effect: Effect.Effect<A, E, KeyValueStore.KeyValueStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())))
```

### Test Cases

```typescript
describe("SpellbookKeyValueStore", () => {
  it("get returns None for missing key", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore
        return yield* kv.get("missing")
      })
    )
    expect(Option.isNone(result)).toBe(true)
  })

  it("set then get returns value", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.set("key", "value")
        return yield* kv.get("key")
      })
    )
    expect(Option.isSome(result)).toBe(true)
    if (Option.isSome(result)) {
      expect(result.value).toBe("value")
    }
  })

  // ... additional tests for remove, size, clear, binary, forSchema, has, isEmpty
})
```

### Run Tests

```bash
turbo run test --filter=@kampus/worker
```

---

## Dependencies

No new runtime dependencies. Uses existing:
- `@effect/platform` (already in project)
- `effect` (already in project)
- `DurableObjectCtx` service (already exists)

Dev dependency added:
- `@effect/vitest` (for potential future use with non-workers tests)
