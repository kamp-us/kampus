import {FetchHttpClient} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {AtomRpc} from "@effect-atom/atom";
import {LibraryRpcs} from "@kampus/library";
import {Layer} from "effect";

// RPC Client using AtomRpc
// Note: URL uses domain-scoped path /rpc/library
export class LibraryRpcClient extends AtomRpc.Tag<LibraryRpcClient>()("LibraryRpcClient", {
	group: LibraryRpcs,
	protocol: RpcClient.layerProtocolHttp({
		url: "/rpc/library",
	}).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provide(FetchHttpClient.layer)),
}) {}
