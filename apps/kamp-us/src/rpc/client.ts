import {FetchHttpClient, HttpClient, HttpClientRequest} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {AtomRpc} from "@effect-atom/atom";
import {LibraryRpcs} from "@kampus/library";
import {Layer} from "effect";
import {getStoredToken} from "../auth/AuthContext";

// Configure HTTP client with Bearer token authentication
// The transformClient option allows us to add auth headers dynamically for each request
export class LibraryRpc extends AtomRpc.Tag<LibraryRpc>()("LibraryRpc", {
	group: LibraryRpcs,
	protocol: RpcClient.layerProtocolHttp({
		url: "/rpc/library",
		transformClient: (client) =>
			HttpClient.mapRequest(client, (req) => {
				const token = getStoredToken();
				if (token) {
					return HttpClientRequest.bearerToken(req, token);
				}
				return req;
			}),
	}).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provide(FetchHttpClient.layer)),
}) {}
