import {DurableObject, env} from "cloudflare:workers";
import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {apiKey, bearer, magicLink} from "better-auth/plugins";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";

export class Pasaport extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	auth = betterAuth({
		emailAndPassword: {enabled: true},
		database: drizzleAdapter(this.db, {
			provider: "sqlite",
			schema,
		}),
		plugins: [
			apiKey({
				defaultPrefix: env.API_KEY_PREFIX,
				startingCharactersConfig: {charactersLength: env.API_KEY_PREFIX.length + 5},
			}),
			bearer(), // We need this plugin to get the bearer token from the response headers
			magicLink({
				sendMagicLink: async ({email, token, url}) => {
					if (env.ENVIRONMENT === "development") {
						console.log("Check console for the magic code", token, url);
					}
					console.log("Magic link requested for email:", email);
				},
			}),
		],
	});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);

			// if (isDev && !this.superUserReady) {
			// 	console.log("Creating superuser...");
			// 	const {user} = await this.createSuperUser();
			// 	if (user) {
			// 		this.superUserReady = true;
			// 	}
			// }
		});
	}

	async fetch(request: Request) {
		console.log("Pasaport DO received request:", request.url);
		return this.auth.handler(request);
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

	async createSuperUser() {
		return this.auth.api.signUpEmail({
			body: {
				name: "Super User",
				email: env.SUPERUSER_EMAIL,
				password: env.SUPERUSER_PASSWORD,
				image: "https://robohash.org/superuser",
			},
		});
	}

	async loginWithEmail(email: string, password: string, headers: Headers) {
		const {response, headers: responseHeaders} = await this.auth.api.signInEmail({
			body: {email, password, rememberMe: false},
			headers,
			returnHeaders: true,
		});

		const {user, token} = response;

		// Prefer bearer token from response headers if available (bearer plugin)
		const bearerToken = responseHeaders?.get("set-auth-token") ?? token;

		return {user, token: bearerToken};
	}

	async listApiKeys(_userID: string) {
		// TODO: Implement API key listing
		return [];
	}

	async validateSession(headers: Headers) {
		try {
			const session = await this.auth.api.getSession({headers});

			if (!session?.user || !session.session) {
				console.log("No session found", session);
				return null;
			}

			return session;
		} catch (error) {
			console.error("Better Auth validateSession failed:", error);
			return null;
		}
	}
}
