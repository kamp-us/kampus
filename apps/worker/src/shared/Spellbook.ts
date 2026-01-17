import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {SqliteDrizzle, make as makeSqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {Effect, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx, DurableObjectEnv} from "../services";

/** Drizzle migrations bundle type (from migrations.js) */
interface DrizzleMigrations {
	journal: {entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>};
	migrations: Record<string, string>;
}

/**
 * Configuration for creating a Durable Object class with Spellbook.
 */
export interface MakeConfig<R extends Rpc.Any, TSchema extends Record<string, unknown> = Record<string, never>> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Handler implementations for each RPC method */
	readonly handlers: RpcGroup.HandlersFrom<R>;
	/** Drizzle migrations bundle (import from drizzle/migrations/migrations.js) */
	readonly migrations: DrizzleMigrations;
	/** Drizzle schema object (from drizzle/drizzle.schema.ts) */
	readonly schema: TSchema;
}

/**
 * Creates a DurableObject class that handles Effect RPC requests.
 *
 * Features:
 * - Runs migrations in constructor via blockConcurrencyWhile
 * - Provides SqlClient to handlers via layer
 * - Provides SqliteDrizzle service with typed schema
 * - Provides DurableObjectEnv and DurableObjectCtx services
 * - Handles HTTP requests via RpcServer.toHttpApp
 *
 * @example
 * ```ts
 * import * as schema from "./drizzle/drizzle.schema"
 * 
 * export const Library = Spellbook.make({
 *   rpcs: LibraryRpcs,
 *   handlers,
 *   migrations,
 *   schema,
 * });
 * ```
 */
export const make = <R extends Rpc.Any, TSchema extends Record<string, unknown> = Record<string, never>, TEnv extends Env = Env>(config: MakeConfig<R, TSchema>) => {
	return class extends DurableObject<TEnv> {
		// biome-ignore lint/suspicious/noExplicitAny: Complex layer types inferred at runtime
		private runtime: ManagedRuntime.ManagedRuntime<any, any>;

		constructor(ctx: DurableObjectState, env: TEnv) {
			super(ctx, env);

			// SQLite client layer with Reactivity included
			const sqliteLayer = SqliteClient.layer({db: ctx.storage.sql});

			// Drizzle layer with typed schema
			const drizzleLayer = Layer.effect(
				SqliteDrizzle,
				makeSqliteDrizzle({schema: config.schema}),
			);

			// Durable Object context services
			const doLayer = Layer.mergeAll(
				Layer.succeed(DurableObjectEnv, env),
				Layer.succeed(DurableObjectCtx, ctx),
			);

			// RPC handler layer
			const handlerLayer = Layer.mergeAll(
				config.rpcs.toLayer(config.handlers),
				RpcSerialization.layerJson,
				Layer.scope,
			);

			// Compose all layers: handlers get sql + drizzle + do services
			const fullLayer = Layer.provideMerge(handlerLayer, Layer.mergeAll(doLayer, sqliteLayer, drizzleLayer));

			// biome-ignore lint/suspicious/noExplicitAny: Layer composition types are complex
			this.runtime = ManagedRuntime.make(fullLayer as Layer.Layer<any, any, never>);

			// Run Drizzle migrations before any requests are processed
			this.ctx.blockConcurrencyWhile(async () => {
				const db = drizzle(ctx.storage);
				migrate(db, config.migrations);
			});
		}

		async fetch(request: Request): Promise<Response> {
			return this.runtime.runPromise(
				Effect.gen(function* () {
					const httpApp = yield* RpcServer.toHttpApp(config.rpcs);
					const response = yield* httpApp.pipe(
						Effect.provideService(
							HttpServerRequest.HttpServerRequest,
							HttpServerRequest.fromWeb(request),
						),
					);
					return HttpServerResponse.toWeb(response);
				}),
			);
		}
	};
};
