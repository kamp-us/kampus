import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import type {SqlClient} from "@effect/sql";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {Effect, String as EffectString, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx, DurableObjectEnv} from "../services";

/** Drizzle migrations bundle type (from migrations.js) */
interface DrizzleMigrations {
	journal: {entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>};
	migrations: Record<string, string>;
}

/**
 * Configuration for creating a Durable Object class with Spellbook.
 */
export interface MakeConfig<R extends Rpc.Any> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Handler implementations for each RPC method */
	readonly handlers: RpcGroup.HandlersFrom<R>;
	/** Drizzle migrations bundle (import from drizzle/migrations/migrations.js) */
	readonly migrations: DrizzleMigrations;
	/** Optional additional layers (e.g., repositories) that depend on SqlClient */
	readonly layers?: Layer.Layer<any, never, SqlClient.SqlClient>;
}

/**
 * Creates a DurableObject class that handles Effect RPC requests.
 *
 * Features:
 * - Runs migrations in constructor via blockConcurrencyWhile
 * - Provides SqlClient to handlers via layer
 * - Provides DurableObjectEnv and DurableObjectCtx services
 * - Handles HTTP requests via RpcServer.toHttpApp
 *
 * @example
 * ```ts
 * export const Library = Spellbook.make({
 *   rpcs: LibraryRpcs,
 *   handlers,
 *   migrations: { loader: migrations, table: "_migrations" },
 * });
 * ```
 */
export const make = <R extends Rpc.Any, TEnv extends Env = Env>(config: MakeConfig<R>) => {
	return class extends DurableObject<TEnv> {
		private runtime: ManagedRuntime.ManagedRuntime<any, any>;

		constructor(ctx: DurableObjectState, env: TEnv) {
			super(ctx, env);

			// SQLite client layer with column name transforms (camelCase <-> snake_case)
			const sqliteLayer = SqliteClient.layer({
				db: ctx.storage.sql,
				transformQueryNames: EffectString.camelToSnake,
				transformResultNames: EffectString.snakeToCamel,
			});

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

			// Optional repository/service layers
			const repoLayer = config.layers ?? Layer.empty;

			// Compose all layers: handlers get sql + do services + repos
			const fullLayer = Layer.provideMerge(
				handlerLayer,
				Layer.provideMerge(repoLayer, Layer.mergeAll(doLayer, sqliteLayer)),
			);

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
