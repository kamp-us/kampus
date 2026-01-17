import {Effect, Request, RequestResolver} from "effect";
import {GetTag} from "../requests";
import {LibraryClient} from "./LibraryClient";

/**
 * Batched RequestResolver for tag lookups.
 * Automatically batches multiple GetTag requests within the same Effect tick
 * into a single getBatchTag RPC call.
 *
 * @example
 * ```ts
 * // These will batch into one RPC call:
 * const [a, b, c] = yield* Effect.all([
 *   loadTag("tag_1"),
 *   loadTag("tag_2"),
 *   loadTag("tag_3"),
 * ]);
 * ```
 */
export const TagResolver = RequestResolver.makeBatched(
	(requests: ReadonlyArray<GetTag>) =>
		Effect.gen(function* () {
			const client = yield* LibraryClient;
			const ids = requests.map((r) => r.id);
			const results = yield* client.getBatchTag({ids});

			yield* Effect.forEach(requests, (req, i) =>
				Request.completeEffect(req, Effect.succeed(results[i] ?? null)),
			);
		}),
).pipe(RequestResolver.contextFromServices(LibraryClient));

/**
 * Helper to load a single tag with automatic batching.
 */
export const loadTag = (id: string) => Effect.request(GetTag({id}), TagResolver);
