import {Effect, Request, RequestResolver} from "effect";
import {GetStory} from "../requests";
import {LibraryClient} from "./LibraryClient";

/**
 * Batched RequestResolver for story lookups.
 * Automatically batches multiple GetStory requests within the same Effect tick
 * into a single getBatchStory RPC call.
 *
 * @example
 * ```ts
 * // These will batch into one RPC call:
 * const [a, b, c] = yield* Effect.all([
 *   loadStory("story_1"),
 *   loadStory("story_2"),
 *   loadStory("story_3"),
 * ]);
 * ```
 */
export const StoryResolver = RequestResolver.makeBatched(
	(requests: ReadonlyArray<GetStory>) =>
		Effect.gen(function* () {
			const client = yield* LibraryClient;
			const ids = requests.map((r) => r.id);
			const results = yield* client.getBatchStory({ids});

			yield* Effect.forEach(requests, (req, i) =>
				Request.completeEffect(req, Effect.succeed(results[i] ?? null)),
			);
		}),
).pipe(RequestResolver.contextFromServices(LibraryClient));

/**
 * Helper to load a single story with automatic batching.
 */
export const loadStory = (id: string) =>
	Effect.request(GetStory({id}), StoryResolver);
