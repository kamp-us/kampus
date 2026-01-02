import {DurableObject} from "cloudflare:workers";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {createAuth} from "./auth";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";

export class Pasaport extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	auth = createAuth(this.db);

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
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

	async validateBearerToken(token: string) {
		try {
			const headers = new Headers();
			headers.set("Authorization", `Bearer ${token}`);
			const session = await this.auth.api.getSession({headers});

			if (!session?.user) {
				return null;
			}

			return session;
		} catch (error) {
			console.error("Better Auth validateBearerToken failed:", error);
			return null;
		}
	}
}
