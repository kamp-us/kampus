import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import type {SqlError} from "@effect/sql";
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
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
 * Handler type that allows SqlError in the error channel.
 * Spellbook's wrapHandlers will catch SqlError and die, making the final error channel match the RPC schema.
 *
 * Per effect-patterns.md: In DO context, SqlError is typically a defect (bug in query)
 * since there are no connection issues with embedded SQLite.
 */
type HandlersWithSqlError<R extends Rpc.Any> = {
	readonly [Current in R as Current["_tag"]]: (
		payload: Rpc.Payload<Current>,
		options: {readonly clientId: number; readonly headers: Headers},
	) => Effect.Effect<Rpc.Success<Current>, SqlError.SqlError | Rpc.Error<Current>, any>;
};

/**
 * Wraps all handlers to automatically catch SqlError and die.
 * This removes the need for `.pipe(Effect.orDie)` in every handler.
 */
const wrapHandlers = <R extends Rpc.Any>(
	handlers: HandlersWithSqlError<R>,
): RpcGroup.HandlersFrom<R> =>
	Object.fromEntries(
		Object.entries(handlers).map(([name, handler]) => [
			name,
			(...args: [any, any]) =>
				(handler as (...args: [any, any]) => Effect.Effect<any, any, any>)(...args).pipe(
					Effect.catchTag("SqlError", Effect.die),
				),
		]),
	) as RpcGroup.HandlersFrom<R>;

/**
 * Configuration for creating a Durable Object class with Spellbook.
 */
export interface MakeConfig<R extends Rpc.Any, TSchema extends DrizzleSchema> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Handler implementations for each RPC method (may have SqlError in error channel - auto-caught) */
	readonly handlers: HandlersWithSqlError<R>;
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

			const drizzleLayer = SqliteDrizzle.layer.pipe(Layer.provideMerge(sqliteLayer));

			// Durable Object context services
			const doLayer = Layer.mergeAll(
				Layer.succeed(DurableObjectEnv, env),
				Layer.succeed(DurableObjectCtx, ctx),
			);

			// RPC handler layer (with SqlError auto-catching)
			const wrappedHandlers = wrapHandlers(config.handlers);
			const handlerLayer = Layer.mergeAll(
				config.rpcs.toLayer(wrappedHandlers),
				RpcSerialization.layerJson,
				Layer.scope,
			);

			// Drizzle needs SqlClient, so provide sqliteLayer to drizzleLayer
			const drizzleWithSql = Layer.provideMerge(drizzleLayer, sqliteLayer);

			// Compose all layers: handlers get sql + drizzle + do services
			const fullLayer = Layer.provideMerge(handlerLayer, Layer.mergeAll(doLayer, drizzleWithSql));

			this.runtime = ManagedRuntime.make(fullLayer as Layer.Layer<any, any, never>);

			// Run Drizzle migrations before any requests are processed
			this.ctx.blockConcurrencyWhile(async () => {
				const db = drizzle(ctx.storage);
				await migrate(db, config.migrations);
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
