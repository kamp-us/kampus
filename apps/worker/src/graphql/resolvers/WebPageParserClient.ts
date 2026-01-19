import {WebPageParserRpcs} from "@kampus/web-page-parser";
import {Effect} from "effect";
import {getNormalizedUrl} from "../../features/library/getNormalizedUrl";
import * as Spellcaster from "../../shared/Spellcaster";

export interface WebPageMetadata {
	title: string | null;
	description: string | null;
}

export interface ReaderContent {
	title: string;
	content: string;
	excerpt: string | null;
	byline: string | null;
	siteName: string | null;
	wordCount: number;
	readingTimeMinutes: number;
}

export interface ReaderResult {
	readable: boolean;
	content: ReaderContent | null;
	error: string | null;
}

/**
 * Creates an initialized WebPageParser client for the given URL.
 *
 * This is a stateless API - each call fetches/caches metadata for the URL.
 * The DO handles caching internally, but from the consumer's perspective
 * it's just: give URL, get metadata.
 *
 * @example
 * ```ts
 * const client = yield* WebPageParserClient.make(env, url);
 * const metadata = yield* client.getMetadata();
 * ```
 */
export const make = (env: Env, url: string) =>
	Effect.gen(function* () {
		const normalizedUrl = getNormalizedUrl(url);
		const client = yield* Spellcaster.make({
			rpcs: WebPageParserRpcs,
			stub: env.WEB_PAGE_PARSER.get(env.WEB_PAGE_PARSER.idFromName(normalizedUrl)),
		});
		yield* client.init({url});

		return {
			getMetadata: (): Effect.Effect<WebPageMetadata> =>
				Effect.gen(function* () {
					const metadata = yield* client.getMetadata({});
					return {
						title: metadata.title || null,
						description: metadata.description || null,
					};
				}),
			getReaderContent: (opts?: {forceFetch?: boolean}): Effect.Effect<ReaderResult> =>
				Effect.gen(function* () {
					const result = yield* client.getReaderContent({forceFetch: opts?.forceFetch});
					return {
						readable: result.readable,
						content: result.content
							? {
									title: result.content.title,
									content: result.content.content,
									excerpt: result.content.excerpt,
									byline: result.content.byline,
									siteName: result.content.siteName,
									wordCount: result.content.wordCount,
									readingTimeMinutes: result.content.readingTimeMinutes,
								}
							: null,
						error: result.error,
					};
				}),
		};
	});

export const WebPageParserClient = {make};
