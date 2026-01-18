import type {Rpc, RpcGroup} from "@effect/rpc";
import type {RpcClient} from "@effect/rpc";
import {Effect} from "effect";

/** Minimal interface for DO stubs - just needs fetch */
interface Fetchable {
	fetch(request: Request): Promise<Response>;
}

/**
 * Configuration for creating a typed RPC client for a Durable Object.
 */
export interface MakeConfig<R extends Rpc.Any> {
	/** RPC group definitions (from @kampus/library etc.) */
	readonly rpcs: RpcGroup.RpcGroup<R>;
	/** Durable Object stub to send requests to */
	readonly stub: Fetchable;
}

/**
 * Creates a typed Effect RPC client for a Durable Object stub.
 *
 * This factory uses direct fetch with Effect RPC JSON protocol format
 * to communicate with Spellbook-based Durable Objects.
 *
 * Note: This is a simplified implementation that bypasses @effect/platform's
 * HTTP client which has issues in the Cloudflare Workers runtime.
 *
 * @example
 * ```ts
 * const client = yield* Spellcaster.make({
 *   rpcs: LibraryRpcs,
 *   stub: env.LIBRARY.get(env.LIBRARY.idFromName(userId))
 * });
 * const story = yield* client.getStory({id: "story_123"});
 * ```
 */
export const make = <R extends Rpc.Any>(
	config: MakeConfig<R>,
): Effect.Effect<RpcClient.RpcClient<R>> => {
	// Create a function that makes RPC requests
	const makeRpcCall = <T>(tag: string, payload: unknown): Effect.Effect<T, unknown> =>
		Effect.gen(function* () {
			const response = yield* Effect.promise(() =>
				config.stub.fetch(
					new Request("http://do.internal/rpc", {
						method: "POST",
						headers: {"Content-Type": "application/json"},
						body: JSON.stringify({
							_tag: "Request",
							id: String(Date.now()) + String(Math.floor(Math.random() * 1000000)),
							tag,
							payload,
							headers: [],
						}),
					}),
				),
			);

			const data = (yield* Effect.promise(() => response.json())) as Array<{
				_tag: string;
				exit?: {_tag: string; value?: unknown; cause?: {_tag?: string; error?: unknown; message?: string}};
			}>;

			// Response format: [{ _tag: "Exit", requestId, exit: { _tag: "Success", value } | { _tag: "Failure", cause } }]
			if (Array.isArray(data) && data[0]?._tag === "Exit") {
				const exit = data[0].exit;
				if (exit?._tag === "Success") {
					return exit.value as T;
				}
				// Handle failure - extract error from cause
				const cause = exit?.cause;
				console.error("[Spellcaster] RPC failure for", tag, ":", JSON.stringify(cause));
				if (cause?._tag === "Fail" && cause.error) {
					return yield* Effect.fail(cause.error);
				}
				return yield* Effect.die(new Error(JSON.stringify(cause) ?? "RPC call failed"));
			}
			return yield* Effect.die(new Error("Invalid RPC response format"));
		});

	// Build a client object with methods for each RPC
	const client = {} as Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>;

	// Get RPC tags from the group - iterate over the RpcGroup's requests Map
	for (const tag of config.rpcs.requests.keys()) {
		client[tag] = (payload: unknown) => makeRpcCall(tag, payload);
	}

	return Effect.succeed(client as RpcClient.RpcClient<R>);
};
