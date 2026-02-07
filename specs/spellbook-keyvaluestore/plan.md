# Spellbook KeyValueStore - Implementation Plan

## Prerequisites

- [ ] Add `@effect/vitest` dev dependency

```bash
pnpm add -D @effect/vitest --filter @kampus/worker
```

---

## Step 1: Create SpellbookKeyValueStore.ts

**File:** `apps/worker/src/shared/SpellbookKeyValueStore.ts`

```typescript
import {KeyValueStore, PlatformError} from "@effect/platform"
import {Effect, Layer, Option} from "effect"
import {DurableObjectCtx} from "../services"

const makeError = (method: string, message: string) =>
  PlatformError.SystemError({
    reason: "Unknown",
    module: "KeyValueStore",
    method,
    message,
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
            const value = await storage.get<ArrayBuffer>(key)
            return Option.fromNullable(value ? new Uint8Array(value) : undefined)
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
          try: async () => {
            await storage.delete(key)
          },
          catch: (e) => makeError("remove", String(e)),
        }),

      clear: Effect.tryPromise({
        try: () => storage.deleteAll(),
        catch: (e) => makeError("clear", String(e)),
      }),

      size: Effect.tryPromise({
        try: async () => (await storage.list()).size,
        catch: (e) => makeError("size", String(e)),
      }),
    })
  })
)
```

---

## Step 2: Create Tests

**File:** `apps/worker/test/spellbook-keyvaluestore.spec.ts`

```typescript
import {KeyValueStore} from "@effect/platform"
import {assert, it} from "@effect/vitest"
import {Effect, Layer, Option, Schema} from "effect"
import {layer} from "../src/shared/SpellbookKeyValueStore"
import {DurableObjectCtx} from "../src/services"

const makeTestLayer = () => {
  const store = new Map<string, unknown>()
  const mockStorage = {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      store.set(key, value)
    },
    delete: async (key: string) => store.delete(key),
    deleteAll: async () => {
      store.clear()
    },
    list: async () => store,
  }
  return layer.pipe(
    Layer.provide(
      Layer.succeed(DurableObjectCtx, {storage: mockStorage} as unknown as DurableObjectState)
    )
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

---

## Step 3: Verify

```bash
# Type check
turbo run typecheck --filter @kampus/worker

# Run tests
turbo run test --filter @kampus/worker
```

---

## Step 4: Usage Example (Optional)

Update `web-page-parser` to use KeyValueStore instead of raw `ctx.storage`:

**Before:**
```typescript
const ctx = yield* DurableObjectCtx
yield* Effect.promise(() => ctx.storage.put("url", url))
const url = yield* Effect.promise(() => ctx.storage.get<string>("url"))
```

**After:**
```typescript
const kv = yield* KeyValueStore.KeyValueStore
yield* kv.set("url", url)
const urlOpt = yield* kv.get("url")
const url = Option.getOrThrow(urlOpt)
```

This step is optional — can be done in a follow-up PR.

---

## Files Changed

| File | Action |
|------|--------|
| `apps/worker/package.json` | Add `@effect/vitest` |
| `apps/worker/src/shared/SpellbookKeyValueStore.ts` | Create |
| `apps/worker/test/spellbook-keyvaluestore.spec.ts` | Create |

---

## Verification Checklist

- [ ] `pnpm add -D @effect/vitest --filter @kampus/worker`
- [ ] Create `SpellbookKeyValueStore.ts`
- [ ] Create test file
- [ ] `turbo run typecheck` passes
- [ ] `turbo run test` passes
- [ ] All 8 test cases green
