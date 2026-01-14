import {FetchHttpClient} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {LibraryRpcs, PasaportRpcs} from "@kampus/library";
import {Effect, Layer} from "effect";

/**
 * Creates a custom Fetch function that routes to a DO stub.
 */
const makeDoFetch = (
	stub: DurableObjectStub,
	basePath: string,
	headers?: Headers,
): typeof globalThis.fetch => {
	return async (input, init) => {
		const originalUrl =
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const url = new URL(originalUrl);
		url.pathname = basePath + url.pathname;

		const mergedHeaders = new Headers(init?.headers);
		if (headers) {
			for (const [key, value] of headers.entries()) {
				mergedHeaders.set(key, value);
			}
		}

		const modifiedRequest = new Request(url.toString(), {
			...init,
			headers: mergedHeaders,
		});

		return stub.fetch(modifiedRequest);
	};
};

/**
 * Creates an RPC client for the Pasaport DO.
 */
export const makePasaportRpc = (stub: DurableObjectStub, headers?: Headers) => {
	const customFetch = makeDoFetch(stub, "/rpc/pasaport", headers);

	const clientLayer = Layer.mergeAll(
		RpcClient.layerProtocolHttp({url: "/"}),
		RpcSerialization.layerJson,
		Layer.succeed(FetchHttpClient.Fetch, customFetch as typeof globalThis.fetch),
		FetchHttpClient.layer,
	);

	return RpcClient.make(PasaportRpcs).pipe(Effect.provide(clientLayer), Effect.scoped);
};

/**
 * Creates an RPC client for the Library DO.
 */
export const makeLibraryRpc = (stub: DurableObjectStub, headers?: Headers) => {
	const customFetch = makeDoFetch(stub, "/rpc/library", headers);

	const clientLayer = Layer.mergeAll(
		RpcClient.layerProtocolHttp({url: "/"}),
		RpcSerialization.layerJson,
		Layer.succeed(FetchHttpClient.Fetch, customFetch as typeof globalThis.fetch),
		FetchHttpClient.layer,
	);

	return RpcClient.make(LibraryRpcs).pipe(Effect.provide(clientLayer), Effect.scoped);
};
