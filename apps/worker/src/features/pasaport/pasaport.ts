import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {
	ApiKeyCreationFailedError,
	InvalidCredentialsError,
	PasaportRpcs,
	UserCreationFailedError,
} from "@kampus/library";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {Effect, Layer, ManagedRuntime} from "effect";
import {createAuth} from "./auth";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";

export class Pasaport extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	auth = createAuth(this.db);

	// Store request headers for session validation in RPC context
	private currentHeaders: Headers | null = null;

	// Effect RPC handlers
	private handlers = {
		signIn: ({email, password}: {email: string; password: string}) =>
			Effect.gen(this, function* () {
				const headers = this.currentHeaders;
				if (!headers) {
					return yield* Effect.fail(new InvalidCredentialsError());
				}

				const {response, headers: responseHeaders} = yield* Effect.promise(() =>
					this.auth.api.signInEmail({
						body: {email, password, rememberMe: false},
						headers,
						returnHeaders: true,
					}),
				);

				const {user} = response;
				const bearerToken = responseHeaders?.get("set-auth-token");

				if (!user || !bearerToken) {
					return yield* Effect.fail(new InvalidCredentialsError());
				}

				return {
					user: {
						id: user.id,
						email: user.email,
						name: user.name ?? null,
						image: user.image ?? null,
					},
					token: bearerToken,
				};
			}),

		signUp: ({email, password, name}: {email: string; password: string; name?: string}) =>
			Effect.gen(this, function* () {
				const result = yield* Effect.promise(() =>
					this.auth.api.signUpEmail({
						body: {
							email,
							password,
							name: name || "User",
							image: `https://robohash.org/${email}`,
						},
					}),
				);

				if (!result.user) {
					return yield* Effect.fail(new UserCreationFailedError({reason: "Failed to create user"}));
				}

				return {
					id: result.user.id,
					email: result.user.email,
					name: result.user.name ?? null,
					image: result.user.image ?? null,
				};
			}),

		validateSession: () =>
			Effect.gen(this, function* () {
				const headers = this.currentHeaders;
				if (!headers) return null;

				const session = yield* Effect.promise(() =>
					this.auth.api.getSession({headers}).catch(() => null),
				);

				if (!session?.user) return null;

				return {
					user: {
						id: session.user.id,
						email: session.user.email,
						name: session.user.name ?? null,
						image: session.user.image ?? null,
					},
					session: {
						id: session.session.id,
						userId: session.session.userId,
						expiresAt:
							session.session.expiresAt instanceof Date
								? session.session.expiresAt.toISOString()
								: String(session.session.expiresAt),
					},
				};
			}),

		me: () =>
			Effect.gen(this, function* () {
				const headers = this.currentHeaders;
				if (!headers) return null;

				const session = yield* Effect.promise(() =>
					this.auth.api.getSession({headers}).catch(() => null),
				);

				if (!session?.user) return null;

				return {
					id: session.user.id,
					email: session.user.email,
					name: session.user.name ?? null,
					image: session.user.image ?? null,
				};
			}),

		createApiKey: ({name, expiresInDays}: {name: string; expiresInDays?: number}) =>
			Effect.gen(this, function* () {
				const headers = this.currentHeaders;
				if (!headers) {
					return yield* Effect.fail(new ApiKeyCreationFailedError({reason: "Not authenticated"}));
				}

				const session = yield* Effect.promise(() =>
					this.auth.api.getSession({headers}).catch(() => null),
				);

				if (!session?.user) {
					return yield* Effect.fail(new ApiKeyCreationFailedError({reason: "Not authenticated"}));
				}

				const result = yield* Effect.promise(() =>
					this.auth.api.createApiKey({
						body: {
							name,
							expiresIn: 60 * 60 * 24 * (expiresInDays ?? 7),
							userId: session.user.id,
						},
					}),
				);

				if (!result.name) {
					return yield* Effect.fail(
						new ApiKeyCreationFailedError({reason: "Failed to create API key"}),
					);
				}

				return {
					name: result.name,
					key: result.key,
				};
			}),
	};

	// Layer provides handlers + JSON serialization + Scope
	private handlerLayer = Layer.mergeAll(
		PasaportRpcs.toLayer(this.handlers),
		RpcSerialization.layerJson,
		Layer.scope,
	);

	// ManagedRuntime for running effects with the handler layer
	private runtime = ManagedRuntime.make(this.handlerLayer);

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	async fetch(request: Request) {
		const url = new URL(request.url);

		// Route RPC requests to Effect RPC handler
		if (url.pathname.startsWith("/rpc/pasaport")) {
			return this.handleRpc(request);
		}

		// Route everything else to Better Auth handler
		console.log("Pasaport DO received request:", request.url);
		return this.auth.handler(request);
	}

	private async handleRpc(request: Request): Promise<Response> {
		// Store headers for session validation
		this.currentHeaders = request.headers;

		try {
			const program = Effect.gen(function* () {
				const httpApp = yield* RpcServer.toHttpApp(PasaportRpcs);
				const response = yield* httpApp.pipe(
					Effect.provideService(
						HttpServerRequest.HttpServerRequest,
						HttpServerRequest.fromWeb(request),
					),
				);
				return HttpServerResponse.toWeb(response);
			});

			return await this.runtime.runPromise(program);
		} finally {
			this.currentHeaders = null;
		}
	}

	// Legacy methods for backwards compatibility with existing code
	async createAdminApiKey(userID: string, name: string, expiresInDays = 7) {
		return this.auth.api.createApiKey({
			body: {
				name,
				expiresIn: 60 * 60 * 24 * expiresInDays,
				userId: userID,
			},
		});
	}

	async createUser(email: string, password: string, name?: string) {
		const result = await this.auth.api.signUpEmail({
			body: {
				email,
				password,
				name: name || "User",
				image: `https://robohash.org/${email}`,
			},
		});

		return result;
	}

	async loginWithEmail(email: string, password: string, headers: Headers) {
		const {response, headers: responseHeaders} = await this.auth.api.signInEmail({
			body: {email, password, rememberMe: false},
			headers,
			returnHeaders: true,
		});

		const {user} = response;

		const bearerToken = responseHeaders?.get("set-auth-token");
		if (!bearerToken) {
			throw new Error("No bearer token returned from server");
		}

		return {user, token: bearerToken};
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
