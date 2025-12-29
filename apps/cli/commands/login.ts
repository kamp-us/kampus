import {Command, Options} from "@effect/cli";
import {ask, type Props} from "bluebun";
import {Console, Effect} from "effect";
import {KampusStateStorage} from "../services/KampusStateStorage";
import {saveConfig} from "../utils/config";
import {graphqlRequest} from "../utils/graphql";

const signIn = Effect.fn(function* (email: string, password: string) {
	// TODO: convert this to tryPromise to provide better error handling
	const result = yield* Effect.promise(() =>
		graphqlRequest<{
			signIn: {
				user: {
					id: string;
					email: string;
					name?: string;
				};
				token: string;
			};
		}>(
			`
				mutation SignIn($email: String!, $password: String!) {
					signIn(email: $email, password: $password) {
						user {
							id
							email
							name
						}
						token
					}
				}
			`,
			{email, password},
		),
	);

	if (result.errors) {
		// TODO: create a special TaggedError for errors
		return yield* Effect.fail(new Error(result.errors[0]?.message || "Login failed"));
	}

	if (!result.data?.signIn?.token) {
		return yield* Effect.fail(new Error("No session token returned from server"));
	}

	return result.data.signIn;
});

export const login = Command.make(
	"login",
	{
		email: Options.text("email"),
		password: Options.text("password"),
	},
	Effect.fn(function* ({email, password}) {
		const store = yield* KampusStateStorage;

		const {user, token} = yield* signIn(email, password);

		yield* store.setSessionToken(token);

		yield* Console.log("✅ Successfully logged in!");
		yield* Console.log(`User: ${user.email}`);
	}),
).pipe(Command.withDescription("Login with superuser credentials"));

export default {
	name: "login",
	description: "Login with superuser credentials",
	run: async (_props: Props) => {
		const email = await ask("Email:", {after: "clear"});

		const password = await ask("Password:", {after: "clear"});

		console.log("Logging in...");

		try {
			const result = await graphqlRequest<{
				signIn: {
					user: {
						id: string;
						email: string;
						name?: string;
					};
					token: string;
				};
			}>(
				`
				mutation SignIn($email: String!, $password: String!) {
					signIn(email: $email, password: $password) {
						user {
							id
							email
							name
						}
						token
					}
				}
			`,
				{email, password},
			);

			if (result.errors) {
				throw new Error(result.errors[0]?.message || "Login failed");
			}

			if (!result.data?.signIn?.token) {
				throw new Error("No session token returned from server");
			}

			const {user, token} = result.data.signIn;

			// Save session token and user info
			saveConfig({
				sessionToken: token,
				user,
			});

			console.log("✅ Successfully logged in!");
			console.log(`User: ${user.email}`);
		} catch (error) {
			console.error("❌ Login failed:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	},
};
