import {DurableObject} from "cloudflare:workers";
import type {Rpc, RpcGroup} from "@effect/rpc";
import type {HandlersFrom} from "@effect/rpc/RpcGroup";
import {Context, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx} from "../../services";

export class SpellbookEnv extends Context.Tag("DO/Env")<SpellbookEnv, Env>() {}

export const SpellbookDurableObject = <R extends Rpc.Any, TEnv extends Record<string, any> = Env>(
	rpcs: RpcGroup.RpcGroup<R>,
	layer: Layer.Layer<HandlersFrom<R>, never, DurableObjectCtx>,
) => {
	return class extends DurableObject<TEnv> {
		runtime = ManagedRuntime.make(
			layer.pipe(Layer.provide(Layer.succeed(DurableObjectCtx, this.ctx))),
		);
	};
};
