import {FetchHttpClient, type HttpClient} from "@effect/platform";
import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {
	type ExtractionStrategy,
	type FetchHttpError,
	type FetchNetworkError,
	type FetchTimeoutError,
	type InvalidProtocolError,
	type PageMetadata,
	PageMetadata as PageMetadataSchema,
	ParseError,
	type ReaderContent,
	type ReaderResult,
} from "@kampus/web-page-parser";
import {desc} from "drizzle-orm";
import {Effect, Match, Schema} from "effect";
import {DurableObjectCtx} from "../../services";
import * as schema from "./drizzle/drizzle.schema";
import {extractPage} from "./extractPage";
import {fetchHtml} from "./fetchHtml";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const isRecent = (createdAt: Date | null) =>
	createdAt && createdAt.getTime() > Date.now() - ONE_DAY_MS;

// Compose fetch + extract into an Effect
const fetchAndExtract = (url: string) =>
	Effect.gen(function* () {
		const html = yield* fetchHtml(url);

		// Wrap pure extraction in Effect.try to catch parse errors
		return yield* Effect.try({
			try: () => extractPage(html, url),
			catch: (e) => new ParseError({url, message: String(e)}),
		});
	});

// Convert errors to ReaderResult with error field
const errorToReaderResult = (
	error: ParseError | FetchTimeoutError | FetchHttpError | FetchNetworkError | InvalidProtocolError,
): ReaderResult =>
	Match.value(error).pipe(
		Match.tag(
			"FetchTimeoutError",
			(): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: "Request timed out",
			}),
		),
		Match.tag(
			"FetchHttpError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: `HTTP ${e.status}`,
			}),
		),
		Match.tag(
			"FetchNetworkError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: e.message,
			}),
		),
		Match.tag(
			"ParseError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: e.message,
			}),
		),
		Match.tag(
			"InvalidProtocolError",
			(e): ReaderResult => ({
				readable: false,
				metadata: null,
				content: null,
				strategy: null,
				error: `Invalid protocol: ${e.protocol}`,
			}),
		),
		Match.exhaustive,
	);

export const handlers = {
	init: ({url}: {url: string}) =>
		Effect.gen(function* () {
			const ctx = yield* DurableObjectCtx;
			yield* Effect.promise(() => ctx.storage.put("url", url));
		}),

	getMetadata: ({forceFetch}: {forceFetch?: boolean}) =>
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

			// Fetch + extract, then return just metadata
			// On network errors, return empty metadata (same pattern as getReaderContent)
			const extracted = yield* fetchAndExtract(url).pipe(
				Effect.provide(FetchHttpClient.layer),
				Effect.catchAll(() =>
					Effect.succeed({
						metadata: {title: "", description: null},
						content: null,
						strategy: null,
					}),
				),
			);

			// Save to database
			yield* db.insert(schema.fetchlog).values({
				title: extracted.metadata.title,
				description: extracted.metadata.description,
			});

			return extracted.metadata;
		}),

	getReaderContent: ({forceFetch}: {forceFetch?: boolean}) =>
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
			const result = yield* fetchAndExtract(url).pipe(
				Effect.map(
					(extracted): ReaderResult => ({
						readable: extracted.content !== null,
						metadata: extracted.metadata,
						content: extracted.content,
						strategy: extracted.strategy,
						error: extracted.content ? null : "No content could be extracted",
					}),
				),
				Effect.catchAll((error) => Effect.succeed(errorToReaderResult(error))),
				Effect.provide(FetchHttpClient.layer),
			);

			// Store result (including error state)
			yield* db.insert(schema.readerContent).values(mapReaderResultToDbRow(result));

			return result;
		}),
};

// Helper to map database row to ReaderResult
const mapDbRowToReaderResult = (row: typeof schema.readerContent.$inferSelect): ReaderResult => {
	// Build metadata if we have it
	const metadata: PageMetadata | null =
		row.metaTitle !== null
			? {
					title: row.metaTitle,
					description: row.metaDescription ?? null,
				}
			: null;

	// Cast strategy to the correct type
	const strategy = row.strategy as ExtractionStrategy;

	if (!row.readable) {
		return {
			readable: false,
			metadata,
			content: null,
			strategy,
			error: row.error,
		};
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

	return {readable: true, metadata, content, strategy, error: null};
};

// Helper to map ReaderResult to database row values
const mapReaderResultToDbRow = (result: ReaderResult): typeof schema.readerContent.$inferInsert => {
	const base = {
		strategy: result.strategy,
		metaTitle: result.metadata?.title ?? null,
		metaDescription: result.metadata?.description ?? null,
	};

	if (!result.readable || !result.content) {
		return {
			...base,
			readable: 0,
			error: result.error,
		};
	}

	return {
		...base,
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
