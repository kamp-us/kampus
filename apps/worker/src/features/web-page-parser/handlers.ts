import {SqlClient} from "@effect/sql";
import {type PageMetadata, PageMetadata as PageMetadataSchema} from "@kampus/web-page-parser";
import {id} from "@usirin/forge";
import {Effect, Schema} from "effect";
import {DurableObjectCtx} from "../../services";
import {fetchPageMetadata} from "./fetchPageMetadata";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

interface FetchLogRow {
	id: string;
	title: string;
	description: string | null;
	created_at: number | null;
}

const isRecent = (createdAt: number | null) => createdAt && createdAt > Date.now() - ONE_DAY_MS;

export const handlers = {
	init: ({url}: {url: string}) =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			yield* Effect.promise(() => ctx.storage.put("url", url));
		}),

	getMetadata: ({forceFetch}: {forceFetch?: boolean}): Effect.Effect<PageMetadata, never, SqlClient.SqlClient | DurableObjectCtx> =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			const sql = yield* SqlClient.SqlClient;

			// Get URL from storage
			const url = yield* Effect.promise(() => ctx.storage.get<string>("url"));
			if (!url) {
				return yield* Effect.die(new Error("WebPageParser not initialized, call init first"));
			}

			// Check for cached result
			const rows = yield* sql<FetchLogRow>`
				SELECT * FROM fetchlog ORDER BY created_at DESC LIMIT 1
			`;
			const lastResult = rows[0];

			if (lastResult && isRecent(lastResult.created_at) && !forceFetch) {
				return Schema.decodeSync(PageMetadataSchema)({
					title: lastResult.title,
					description: lastResult.description,
				});
			}

			// Fetch fresh metadata
			const metadata = yield* Effect.promise(() => fetchPageMetadata(url));

			// Save to database
			yield* sql`
				INSERT INTO fetchlog (id, title, description, created_at)
				VALUES (${id("wbp_flog")}, ${metadata.title}, ${metadata.description}, ${Date.now()})
			`;

			return metadata;
		}).pipe(Effect.orDie),
};
