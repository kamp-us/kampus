import type {RpcClient} from "@effect/rpc";
import {Context, Layer} from "effect";
import * as Spellcaster from "../../shared/Spellcaster";
import {PasaportRpcs} from "./rpc";

export class PasaportClient extends Context.Tag("worker/features/pasaport/PasaportClient")<
	PasaportClient,
	RpcClient.FromGroup<typeof PasaportRpcs>
>() {
	/**
	 * Creates a Layer that provides PasaportClient .
	 */
	static layer(env: Env, name: string): Layer.Layer<PasaportClient> {
		return Layer.effect(
			PasaportClient,
			Spellcaster.make({
				rpcs: PasaportRpcs,
				stub: env.PASAPORT.get(env.PASAPORT.idFromName(name)),
			}),
		);
	}
}
