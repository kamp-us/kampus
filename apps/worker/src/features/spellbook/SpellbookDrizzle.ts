import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {drizzle} from "drizzle-orm/durable-sqlite";
import * as DrizzleMigrator from "drizzle-orm/durable-sqlite/migrator";
import {Data, Effect, Layer} from "effect";
import {DurableObjectCtx} from "../../services";

export class SpellbookDrizzleError extends Data.TaggedError("SpellbookDrizzleError")<{
	method: string;
	cause: unknown;
}> {}

export const layer = (db: SqlStorage) =>
	SqliteDrizzle.layer.pipe(Layer.provide(SqliteClient.layer({db})));

interface DrizzleMigrations {
	journal: {entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>};
	migrations: Record<string, string>;
}

export const migrate = (migrations: DrizzleMigrations) =>
	Effect.gen(function* () {
		const ctx = yield* DurableObjectCtx;
		const db = drizzle(ctx.storage);

		yield* Effect.tryPromise({
			try: () => DrizzleMigrator.migrate(db, migrations),
			catch: (cause) => new SpellbookDrizzleError({method: "migrate", cause}),
		});
	});
