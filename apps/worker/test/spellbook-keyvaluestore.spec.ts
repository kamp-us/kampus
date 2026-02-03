import {KeyValueStore} from "@effect/platform"
import {
	KeyValueStore as SpellbookKeyValueStore,
	type DurableObjectStorage,
} from "@kampus/spellbook"
import {Effect, Option, Schema} from "effect"
import {describe, expect, it} from "vitest"

/**
 * Creates a fresh test layer with mock storage.
 * Each call creates a new in-memory storage Map for isolation.
 */
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
	} as unknown as DurableObjectStorage
	return SpellbookKeyValueStore.layer({storage: mockStorage})
}

/**
 * Runs an Effect with a fresh test layer.
 * Each test gets isolated storage state.
 */
const runTest = <A, E>(effect: Effect.Effect<A, E, KeyValueStore.KeyValueStore>) =>
	Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())))

describe("SpellbookKeyValueStore", () => {
	it("get returns None for missing key", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				return yield* kv.get("missing")
			}),
		)
		expect(Option.isNone(result)).toBe(true)
	})

	it("set then get returns value", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				yield* kv.set("key", "value")
				return yield* kv.get("key")
			}),
		)
		expect(Option.isSome(result)).toBe(true)
		if (Option.isSome(result)) {
			expect(result.value).toBe("value")
		}
	})

	it("remove deletes key", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				yield* kv.set("key", "value")
				yield* kv.remove("key")
				return yield* kv.get("key")
			}),
		)
		expect(Option.isNone(result)).toBe(true)
	})

	it("size returns count", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				yield* kv.set("a", "1")
				yield* kv.set("b", "2")
				return yield* kv.size
			}),
		)
		expect(result).toBe(2)
	})

	it("clear removes all keys", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				yield* kv.set("a", "1")
				yield* kv.set("b", "2")
				yield* kv.clear
				return yield* kv.size
			}),
		)
		expect(result).toBe(0)
	})

	it("binary data round-trips", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				const input = new Uint8Array([1, 2, 3, 4])
				yield* kv.set("binary", input)
				return yield* kv.getUint8Array("binary")
			}),
		)
		expect(Option.isSome(result)).toBe(true)
		if (Option.isSome(result)) {
			expect(Array.from(result.value)).toEqual([1, 2, 3, 4])
		}
	})

	it("forSchema works with typed data", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				const schema = Schema.Struct({name: Schema.String, count: Schema.Number})
				const typed = kv.forSchema(schema)
				yield* typed.set("data", {name: "test", count: 42})
				return yield* typed.get("data")
			}),
		)
		expect(Option.isSome(result)).toBe(true)
		if (Option.isSome(result)) {
			expect(result.value).toEqual({name: "test", count: 42})
		}
	})

	it("has returns true for existing key", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				yield* kv.set("key", "value")
				return yield* kv.has("key")
			}),
		)
		expect(result).toBe(true)
	})

	it("isEmpty returns true when empty", async () => {
		const result = await runTest(
			Effect.gen(function* () {
				const kv = yield* KeyValueStore.KeyValueStore
				return yield* kv.isEmpty
			}),
		)
		expect(result).toBe(true)
	})
})
