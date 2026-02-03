import {env} from "cloudflare:workers";
import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {apiKey, bearer, magicLink} from "better-auth/plugins";
import {Effect, Schema} from "effect";
import * as schema from "../drizzle/drizzle.schema";

class BetterAuthError extends Schema.TaggedError<BetterAuthError>()("BetterAuthError", {
	method: Schema.String,
	cause: Schema.Defect,
}) {}

export class BetterAuth extends Effect.Service<BetterAuth>()(
	"worker/features/pasaport/services/BetterAuth",
	{
		effect: Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

			const client = betterAuth({
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

			const use = <A>(
				f: (auth: typeof client) => Promise<A>,
			): Effect.Effect<A, BetterAuthError> => {
				return Effect.tryPromise({
					try: () => f(client),
					catch: (cause) => new BetterAuthError({method: "use", cause}),
				});
			};

			return {use};
		}),
	},
) {}
