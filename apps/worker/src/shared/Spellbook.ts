import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import type {SqlClient} from "@effect/sql";
import {make as makeDrizzle, SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {SqliteClient} from "@effect/sql-sqlite-do";
import type {Table} from "drizzle-orm";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {Effect, String as EffectString, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx, DurableObjectEnv} from "../services";

/** Drizzle migrations bundle type (from migrations.js) */
interface DrizzleMigrations {
	journal: {entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>};
	migrations: Record<string, string>;
}

/** Schema type constraint - must be a record of Drizzle tables */
type DrizzleSchema = Record<string, Table>;

/**
 * Configuration for creating a Durable Object class with Spellbook.
 */
export interface MakeConfig<R extends Rpc.Any, TSchema extends DrizzleSchema> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Handler implementations for each RPC method */
	readonly handlers: RpcGroup.HandlersFrom<R>;
	/** Drizzle migrations bundle (import from drizzle/migrations/migrations.js) */
	readonly migrations: DrizzleMigrations;
	/** Drizzle schema (tables exported from drizzle.schema.ts) */
	readonly schema: TSchema;
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
export const make = <R extends Rpc.Any, TSchema extends DrizzleSchema, TEnv extends Env = Env>(
	config: MakeConfig<R, TSchema>,
) => {
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

			// Drizzle layer - provides SqliteDrizzle service
			// Note: schema is passed for runtime table mapping; handlers import schema directly for types
			// Cast needed: SqliteDrizzle tag uses untyped SqliteRemoteDatabase
			const drizzleLayer = Layer.effect(
				SqliteDrizzle,
				makeDrizzle({schema: config.schema}) as unknown as Effect.Effect<
					typeof SqliteDrizzle.Service,
					never,
					SqlClient.SqlClient
				>,
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

			// Drizzle needs SqlClient, so provide sqliteLayer to drizzleLayer
			const drizzleWithSql = Layer.provideMerge(drizzleLayer, sqliteLayer);

			// Compose all layers: handlers get sql + drizzle + do services
			const fullLayer = Layer.provideMerge(
				handlerLayer,
				Layer.mergeAll(doLayer, sqliteLayer, drizzleWithSql),
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
