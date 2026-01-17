import {SqlClient} from "@effect/sql";
import {make as makeSqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {type PageMetadata, PageMetadata as PageMetadataSchema} from "@kampus/web-page-parser";
import {id} from "@usirin/forge";
import {desc} from "drizzle-orm";
import {Effect, Schema} from "effect";
import {DurableObjectCtx} from "../../services";
import * as schema from "./drizzle/drizzle.schema";
import {fetchPageMetadata} from "./fetchPageMetadata";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

// Helper to get typed database
const getDb = () => makeSqliteDrizzle({schema});

const isRecent = (createdAt: Date | null) => createdAt && createdAt.getTime() > Date.now() - ONE_DAY_MS;

export const handlers = {
	init: ({url}: {url: string}) =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			yield* Effect.promise(() => ctx.storage.put("url", url));
		}),

	getMetadata: ({forceFetch}: {forceFetch?: boolean}): Effect.Effect<PageMetadata, never, DurableObjectCtx | SqlClient.SqlClient> =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			const db = yield* getDb();

			// Get URL from storage
			const url = yield* Effect.promise(() => ctx.storage.get<string>("url"));
			if (!url) {
				return yield* Effect.die(new Error("WebPageParser not initialized, call init first"));
			}

			// Check for cached result
			const [lastResult] = yield* db
				.select()
				.from(schema.fetchlog)
				.orderBy(desc(schema.fetchlog.createdAt))
				.limit(1);

			if (lastResult && isRecent(lastResult.createdAt) && !forceFetch) {
				return Schema.decodeSync(PageMetadataSchema)({
					title: lastResult.title,
					description: lastResult.description,
				});
			}

			// Fetch fresh metadata
			const metadata = yield* Effect.promise(() => fetchPageMetadata(url));

			// Save to database
			yield* db.insert(schema.fetchlog).values({
				id: id("wbp_flog"),
				title: metadata.title,
				description: metadata.description,
			});

			return metadata;
		}).pipe(Effect.orDie),
};
