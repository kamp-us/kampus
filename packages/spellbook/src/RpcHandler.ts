import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { type Rpc, type RpcGroup, RpcServer } from "@effect/rpc"
import { Context, Effect, Layer } from "effect"

/**
 * Service tag for the RPC handler.
 *
 * This service creates the httpApp once during layer construction,
 * avoiding the overhead of rebuilding it on every request.
 */
export class RpcHandler extends Context.Tag("@kampus/spellbook/RpcHandler")<
	RpcHandler,
	{
		readonly handle: (request: Request) => Effect.Effect<Response>
	}
>() {}

/**
 * Creates a layer that builds httpApp once at construction time.
 *
 * @param rpcs - The RPC group to handle
 * @returns Layer that provides RpcHandler service
 */
export const layer = <R extends Rpc.Any>(rpcs: RpcGroup.RpcGroup<R>) =>
	Layer.scoped(
		RpcHandler,
		Effect.gen(function* () {
			// Create httpApp once during layer construction
			const httpApp = yield* RpcServer.toHttpApp(rpcs)

			return {
				handle: (request: Request) =>
					httpApp.pipe(
						Effect.provideService(
							HttpServerRequest.HttpServerRequest,
							HttpServerRequest.fromWeb(request),
						),
						Effect.map(HttpServerResponse.toWeb),
						Effect.scoped,
					),
			}
		}),
	)

/**
 * Converts an Effect RPC group into a web Request/Response handler.
 *
 * This bridges the gap between Effect's HTTP abstractions and the
 * web standard Request/Response used by Cloudflare Workers.
 *
 * @deprecated Use RpcHandler service with layer() instead for better performance.
 * This function creates a new httpApp on every call.
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
