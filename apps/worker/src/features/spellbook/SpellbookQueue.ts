import {PersistedQueue} from "@effect/experimental";
import {SqlPersistedQueue} from "@effect/sql";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {Layer} from "effect";

export const layer = (db: SqlStorage) =>
	PersistedQueue.layer.pipe(
		Layer.provide(SqlPersistedQueue.layerStore()),
		Layer.provide(SqliteClient.layer({db})),
	);
