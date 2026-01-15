import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {SqliteClient, SqliteMigrator} from "@effect/sql-sqlite-do";
import {Effect, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx, DurableObjectEnv} from "../services";

/**
 * Configuration for creating a Durable Object class with Spellbook.
 */
export interface MakeConfig<R extends Rpc.Any> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Handler implementations for each RPC method */
	readonly handlers: RpcGroup.HandlersFrom<R>;
	/** Effect SQL migrations configuration */
	readonly migrations: SqliteMigrator.MigratorOptions<never>;
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
		// biome-ignore lint/suspicious/noExplicitAny: Complex layer types inferred at runtime
		private runtime: ManagedRuntime.ManagedRuntime<any, any>;

		constructor(ctx: DurableObjectState, env: TEnv) {
			super(ctx, env);

			// SQLite client layer with Reactivity included
			const sqliteLayer = SqliteClient.layer({db: ctx.storage.sql});

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

			// Compose all layers: handlers get sql + do services
			const fullLayer = Layer.provideMerge(handlerLayer, Layer.mergeAll(doLayer, sqliteLayer));

			// biome-ignore lint/suspicious/noExplicitAny: Layer composition types are complex
			this.runtime = ManagedRuntime.make(fullLayer as Layer.Layer<any, any, never>);

			// Run migrations before any requests are processed
			this.ctx.blockConcurrencyWhile(() =>
				this.runtime.runPromise(SqliteMigrator.run(config.migrations)),
			);
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
