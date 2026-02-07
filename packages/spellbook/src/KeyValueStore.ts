import type {DurableObjectStorage} from "@cloudflare/workers-types"
import {KeyValueStore} from "@effect/platform"
import * as PlatformError from "@effect/platform/Error"
import {Effect, Layer, Option} from "effect"

const makeError = (method: string, description: string) =>
	new PlatformError.SystemError({
		reason: "Unknown",
		module: "KeyValueStore",
		method,
		description,
	})

export interface Config {
	readonly storage: DurableObjectStorage
}

export const layer = (config: Config): Layer.Layer<KeyValueStore.KeyValueStore> =>
	Layer.succeed(
		KeyValueStore.KeyValueStore,
		KeyValueStore.make({
			get: (key) =>
				Effect.tryPromise({
					try: async () => {
						const value = await config.storage.get<string>(key)
						return Option.fromNullable(value)
					},
					catch: (e) => makeError("get", String(e)),
				}),

			getUint8Array: (key) =>
				Effect.tryPromise({
					try: async () => {
						const buffer = await config.storage.get<ArrayBuffer>(key)
						return Option.fromNullable(
							buffer ? new Uint8Array(buffer) : undefined,
						)
					},
					catch: (e) => makeError("getUint8Array", String(e)),
				}),

			set: (key, value) =>
				Effect.tryPromise({
					try: () => config.storage.put(key, value),
					catch: (e) => makeError("set", String(e)),
				}),

			remove: (key) =>
				Effect.tryPromise({
					try: () => config.storage.delete(key).then(() => undefined),
					catch: (e) => makeError("remove", String(e)),
				}),

			clear: Effect.tryPromise({
				try: () => config.storage.deleteAll(),
				catch: (e) => makeError("clear", String(e)),
			}),

			size: Effect.tryPromise({
				try: async () => {
					const map = await config.storage.list()
					return map.size
				},
				catch: (e) => makeError("size", String(e)),
			}),
		}),
	)
