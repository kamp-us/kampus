import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {type Rpc, type RpcGroup, RpcServer} from "@effect/rpc";
import {Effect} from "effect";

export const make = <R extends Rpc.Any>(rpcs: RpcGroup.RpcGroup<R>, request: Request) =>
	Effect.gen(function* () {
		const httpApp = yield* RpcServer.toHttpApp(rpcs);
		const response = yield* httpApp.pipe(
			Effect.provideService(
				HttpServerRequest.HttpServerRequest,
				HttpServerRequest.fromWeb(request),
			),
		);
		return HttpServerResponse.toWeb(response);
	});
