import {FetchHttpClient} from "@effect/platform";
import type {Rpc, RpcGroup} from "@effect/rpc";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {Effect, Layer} from "effect";

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
 * This factory uses the existing Effect RPC protocol (HTTP + JSON serialization)
 * to communicate with Spellbook-based Durable Objects.
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
	// Custom fetch that routes to the DO stub
	const doFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		return config.stub.fetch(request);
	}) as typeof fetch;

	// HTTP client layer using custom fetch
	const httpClientLayer = FetchHttpClient.layer.pipe(
		Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, doFetch)),
	);

	// RPC protocol layer (HTTP + JSON)
	const protocol = RpcClient.layerProtocolHttp({url: "http://do.internal/rpc"}).pipe(
		Layer.provideMerge(RpcSerialization.layerJson),
		Layer.provideMerge(httpClientLayer),
	);

	// Create and return the typed RPC client
	return RpcClient.make(config.rpcs).pipe(Effect.provide(protocol), Effect.scoped);
};
