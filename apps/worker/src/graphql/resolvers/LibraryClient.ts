import type {RpcClient} from "@effect/rpc";
import {LibraryRpcs} from "@kampus/library";
import {Context, Layer} from "effect";
import * as Spellcaster from "../../shared/Spellcaster";

/**
 * Service that provides a typed Library RPC client for the current user.
 *
 * The client is scoped to the authenticated user's Library Durable Object,
 * enabling batched and typed RPC calls from GraphQL resolvers.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const client = yield* LibraryClient;
 *   const story = yield* client.getStory({id: "story_123"});
 *   return story;
 * });
 *
 * // Provide the layer for a specific user
 * await Effect.runPromise(program.pipe(Effect.provide(LibraryClient.layer(env, userId))));
 * ```
 */
export class LibraryClient extends Context.Tag("@kampus/worker/LibraryClient")<
	LibraryClient,
	RpcClient.FromGroup<typeof LibraryRpcs>
>() {
	/**
	 * Creates a Layer that provides LibraryClient for the specified user.
	 *
	 * @param env - Cloudflare environment with LIBRARY binding
	 * @param userId - Authenticated user's ID for DO routing
	 */
	static layer(env: Env, userId: string): Layer.Layer<LibraryClient> {
		return Layer.effect(
			LibraryClient,
			Spellcaster.make({
				rpcs: LibraryRpcs,
				stub: env.LIBRARY.get(env.LIBRARY.idFromName(userId)),
			}),
		);
	}
}
