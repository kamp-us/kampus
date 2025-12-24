import {env} from "cloudflare:workers";
import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {apiKey, bearer, magicLink} from "better-auth/plugins";
import type {DrizzleSqliteDODatabase} from "drizzle-orm/durable-sqlite";
import * as schema from "./drizzle/drizzle.schema";

export const createAuth = (db: DrizzleSqliteDODatabase<typeof schema>) =>
	betterAuth({
		emailAndPassword: {enabled: true},
		database: drizzleAdapter(db, {
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

export type Session = NonNullable<
	Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
>;
