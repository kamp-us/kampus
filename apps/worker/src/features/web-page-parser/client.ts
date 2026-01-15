import {FetchHttpClient} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {WebPageParserRpcs} from "@kampus/web-page-parser";
import {Effect, Layer, ManagedRuntime} from "effect";

/**
 * Creates a WebPageParser RPC client for DO-to-DO calls.
 *
 * @example
 * ```ts
 * const stub = env.WEB_PAGE_PARSER.get(parserId);
 * const client = makeWebPageParserClient((req) => stub.fetch(req));
 * await client.init(url);
 * const metadata = await client.getMetadata();
 * ```
 */
export const makeWebPageParserClient = (doFetch: (request: Request) => Promise<Response>) => {
	const customFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		return doFetch(request);
	}) as typeof fetch;

	const httpClientLayer = FetchHttpClient.layer.pipe(
		Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, customFetch)),
	);

	const protocol = RpcClient.layerProtocolHttp({url: "http://do.internal/rpc"}).pipe(
		Layer.provideMerge(RpcSerialization.layerJson),
		Layer.provideMerge(httpClientLayer),
	);

	const runtime = ManagedRuntime.make(protocol);

	const run = <A, E>(effect: Effect.Effect<A, E, RpcClient.Protocol>) => runtime.runPromise(effect);

	return {
		init: (url: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(WebPageParserRpcs);
					return yield* client.init({url});
				}).pipe(Effect.scoped),
			),

		getMetadata: (options?: {forceFetch?: boolean}) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(WebPageParserRpcs);
					return yield* client.getMetadata({forceFetch: options?.forceFetch});
				}).pipe(Effect.scoped),
			),

		dispose: () => runtime.dispose(),
	};
};
