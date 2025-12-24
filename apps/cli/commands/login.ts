import {ask, type Props} from "bluebun";
import {saveConfig} from "../utils/config";
import {graphqlRequest} from "../utils/graphql";

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
