import {DurableObject} from "cloudflare:workers";
import {type Auth, type BetterAuthOptions, betterAuth, type DBAdapter} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {apiKey, magicLink} from "better-auth/plugins";
import {type DrizzleSqliteDODatabase, drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {env} from "cloudflare:workers";

const API_KEY_PREFIX = "kampus_";

export class Pasaport extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	auth = betterAuth({
		database: drizzleAdapter(this.db, {
			provider: "sqlite",
			schema,
		}),
		plugins: [
			apiKey({
				// TODO(@cansirin): get this from env
				defaultPrefix: API_KEY_PREFIX,
				startingCharactersConfig: {charactersLength: API_KEY_PREFIX.length + 5},
			}),
			magicLink({
				sendMagicLink: async ({email, token, url}) => {
					const isDev = env.ENVIRONMENT === "development";
					if (isDev) {
						console.log("Check console for the magic code", token, url);
					}
					console.log("Magic link requested for email:", email);
				},
			}),
		],
		user: {
			additionalFields: {
				role: {
					type: "string",
					default: "user",
				},
			},
		},
	});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	async init() {}

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

	async getUserByEmail(email: string) {
		const user = this.db.query.user.findFirst({
			where: (user, {eq}) => eq(user.email, email),
		});

		return user;
	}

	async requestMagicLink(email: string, headers: Headers) {
		const result = await this.auth.api.signInMagicLink({
			body: {email, name: email.split("@")[0]},
			headers,
		});
		return result;
	}

	async verifyMagicLink(token: string, headers: Headers, cheatCode?: string, correctCode?: string) {
		const result = await this.auth.api.magicLinkVerify({
			query: {token},
			headers,
		});

		return result;
	}

	async listApiKeys(userID: string) {}

	async validateSession(token: string) {}
}
