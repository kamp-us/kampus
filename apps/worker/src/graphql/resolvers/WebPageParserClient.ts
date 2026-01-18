import {WebPageParserRpcs} from "@kampus/web-page-parser";
import {Effect} from "effect";
import {getNormalizedUrl} from "../../features/library/getNormalizedUrl";
import * as Spellcaster from "../../shared/Spellcaster";

export interface WebPageMetadata {
	title: string | null;
	description: string | null;
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
		};
	});

export const WebPageParserClient = {make};
