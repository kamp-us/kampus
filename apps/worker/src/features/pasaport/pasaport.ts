import {DurableObject} from "cloudflare:workers";
import {RpcSerialization} from "@effect/rpc";
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {RpcHandler} from "@kampus/spellbook";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {Effect, Layer, ManagedRuntime} from "effect";
import {DurableObjectCtx} from "../../services";
import * as SpellbookKeyValueStore from "../../shared/SpellbookKeyValueStore";
import * as SpellbookDrizzle from "../spellbook/SpellbookDrizzle";
import {createAuth} from "./auth";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {PasaportLive as PasaportRpcLive} from "./PasaportLive";
import {PasaportRpcs} from "./rpc";
import {BetterAuth} from "./services/BetterAuth";
import * as BetterAuthPasaport from "./services/BetterAuthPasaport";

const RpcLayer = Layer.mergeAll(
	RpcHandler.layer(PasaportRpcs).pipe(
		Layer.provide(PasaportRpcLive),
		Layer.provide(BetterAuthPasaport.layer),
		Layer.provide(BetterAuth.Default),
		Layer.provide(SqliteDrizzle.layer),
		Layer.provide(SpellbookKeyValueStore.layer),
		Layer.provide(RpcSerialization.layerJson),
	),
	Layer.scope,
);

export class Pasaport extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	auth = createAuth(this.db);

	layer = RpcLayer.pipe(
		Layer.provideMerge(SqliteClient.layer({db: this.ctx.storage.sql})),
		Layer.provideMerge(Layer.succeed(DurableObjectCtx, this.ctx)),
	);

	runtime = ManagedRuntime.make(this.layer);

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.ctx.blockConcurrencyWhile(async () => {
			await Effect.runPromise(
				SpellbookDrizzle.migrate(migrations).pipe(
					Effect.provideService(DurableObjectCtx, this.ctx),
				),
			);
		});
	}

	async fetch(request: Request) {
		console.log("Pasaport DO received request:", request.url);
		if (request.url.includes("/api/auth/")) {
			return this.auth.handler(request);
		}

		return this.rpc(request);
	}

	async rpc(request: Request) {
		return this.runtime.runPromise(
			Effect.flatMap(RpcHandler.RpcHandler, (h) => h.handle(request)),
		);
	}

	async createAdminApiKey(userID: string, name: string, expiresInDays = 7) {
		return this.auth.api.createApiKey({
			body: {
				name,
				expiresIn: 60 * 60 * 24 * expiresInDays,
				userId: userID,
			},
		});
	}

	async listApiKeys(_userID: string) {
		// TODO: Implement API key listing
		return [];
	}

	async validateSession(headers: Headers) {
		try {
			const session = await this.auth.api.getSession({headers});

			if (!session?.user) {
				return null;
			}

			return session;
		} catch (error) {
			console.error("Better Auth validateSession failed:", error);
			return null;
		}
	}
}
