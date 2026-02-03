import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { type Rpc, type RpcGroup, RpcServer } from "@effect/rpc"
import { Effect } from "effect"

/**
 * Converts an Effect RPC group into a web Request/Response handler.
 *
 * This bridges the gap between Effect's HTTP abstractions and the
 * web standard Request/Response used by Cloudflare Workers.
 */
export const handleRpc = <R extends Rpc.Any>(
	rpcs: RpcGroup.RpcGroup<R>,
	request: Request,
) =>
	Effect.gen(function* () {
		const httpApp = yield* RpcServer.toHttpApp(rpcs)
		const response = yield* httpApp.pipe(
			Effect.provideService(
				HttpServerRequest.HttpServerRequest,
				HttpServerRequest.fromWeb(request),
			),
		)
		return HttpServerResponse.toWeb(response)
	})
