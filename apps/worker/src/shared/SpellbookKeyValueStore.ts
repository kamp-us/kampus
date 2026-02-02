import {KeyValueStore} from "@effect/platform"
import * as PlatformError from "@effect/platform/Error"
import {Effect, Layer, Option} from "effect"
import {DurableObjectCtx} from "../services"

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
						return Option.fromNullable(
							buffer ? new Uint8Array(buffer) : undefined,
						)
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
	}),
)
