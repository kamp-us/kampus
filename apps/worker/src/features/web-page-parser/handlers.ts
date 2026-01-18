import {FetchHttpClient} from "@effect/platform";
import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {
	type PageMetadata,
	PageMetadata as PageMetadataSchema,
	type ReaderContent,
	type ReaderResult,
} from "@kampus/web-page-parser";
import {desc} from "drizzle-orm";
import {Effect, Match, Schema} from "effect";
import {DurableObjectCtx} from "../../services";
import * as schema from "./drizzle/drizzle.schema";
import {fetchPageMetadata} from "./fetchPageMetadata";
import {fetchReaderContent} from "./fetchReaderContent";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const isRecent = (createdAt: Date | null) =>
	createdAt && createdAt.getTime() > Date.now() - ONE_DAY_MS;

export const handlers = {
	init: ({url}: {url: string}) =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			yield* Effect.promise(() => ctx.storage.put("url", url));
		}),

	getMetadata: ({
		forceFetch,
	}: {
		forceFetch?: boolean;
	}): Effect.Effect<PageMetadata, never, SqliteDrizzle | DurableObjectCtx> =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			const db = yield* SqliteDrizzle;

			// Get URL from storage
			const url = yield* Effect.promise(() => ctx.storage.get<string>("url"));
			if (!url) {
				return yield* Effect.die(new Error("WebPageParser not initialized, call init first"));
			}

			// Check for cached result
			const rows = yield* db
				.select()
				.from(schema.fetchlog)
				.orderBy(desc(schema.fetchlog.createdAt))
				.limit(1);
			const lastResult = rows[0];

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
				title: metadata.title,
				description: metadata.description,
			});

			return metadata;
		}).pipe(Effect.orDie),

	getReaderContent: ({
		forceFetch,
	}: {
		forceFetch?: boolean;
	}): Effect.Effect<ReaderResult, never, SqliteDrizzle | DurableObjectCtx> =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			const db = yield* SqliteDrizzle;

			// Get URL from storage
			const url = yield* Effect.promise(() => ctx.storage.get<string>("url"));
			if (!url) {
				return yield* Effect.die(new Error("WebPageParser not initialized, call init first"));
			}

			// Check for cached result
			const rows = yield* db
				.select()
				.from(schema.readerContent)
				.orderBy(desc(schema.readerContent.createdAt))
				.limit(1);
			const cached = rows[0];

			if (cached && isRecent(cached.createdAt) && !forceFetch) {
				return mapDbRowToReaderResult(cached);
			}

			// Fetch fresh content - errors converted to ReaderResult
			const result = yield* fetchReaderContent(url).pipe(
				Effect.map(
					(content): ReaderResult => ({readable: true, content, error: null}),
				),
				Effect.catchAll((error) =>
					Effect.succeed(
						Match.value(error).pipe(
							Match.tag("FetchTimeoutError", (): ReaderResult => ({readable: false, content: null, error: "Request timed out"})),
							Match.tag("FetchHttpError", (e): ReaderResult => ({readable: false, content: null, error: `HTTP ${e.status}`})),
							Match.tag("FetchNetworkError", (e): ReaderResult => ({readable: false, content: null, error: e.message})),
							Match.tag("NotReadableError", (): ReaderResult => ({readable: false, content: null, error: "Page is not article content"})),
							Match.tag("ParseError", (e): ReaderResult => ({readable: false, content: null, error: e.message})),
							Match.tag("InvalidProtocolError", (e): ReaderResult => ({readable: false, content: null, error: `Invalid protocol: ${e.protocol}`})),
							Match.exhaustive,
						),
					),
				),
				Effect.provide(FetchHttpClient.layer),
			);

			// Store result (including error state)
			yield* db.insert(schema.readerContent).values(mapReaderResultToDbRow(result));

			return result;
		}).pipe(Effect.orDie),
};

// Helper to map database row to ReaderResult
const mapDbRowToReaderResult = (row: typeof schema.readerContent.$inferSelect): ReaderResult => {
	if (!row.readable) {
		return {readable: false, content: null, error: row.error};
	}

	const content: ReaderContent = {
		title: row.title ?? "",
		content: row.content ?? "",
		textContent: row.textContent ?? "",
		excerpt: row.excerpt ?? null,
		byline: row.byline ?? null,
		siteName: row.siteName ?? null,
		wordCount: row.wordCount ?? 0,
		readingTimeMinutes: row.readingTimeMinutes ?? 0,
	};

	return {readable: true, content, error: null};
};

// Helper to map ReaderResult to database row values
const mapReaderResultToDbRow = (result: ReaderResult): typeof schema.readerContent.$inferInsert => {
	if (!result.readable || !result.content) {
		return {
			readable: 0,
			error: result.error,
		};
	}

	return {
		readable: 1,
		title: result.content.title,
		content: result.content.content,
		textContent: result.content.textContent,
		excerpt: result.content.excerpt,
		byline: result.content.byline,
		siteName: result.content.siteName,
		wordCount: result.content.wordCount,
		readingTimeMinutes: result.content.readingTimeMinutes,
		error: null,
	};
};
