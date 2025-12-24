import {ask, type Props} from "bluebun";
import {graphqlRequest} from "../utils/graphql";

export default {
	name: "bootstrap",
	description: "Bootstrap initial super user (for initial setup)",
	run: async (_props: Props) => {
		console.log("🚀 Bootstrap: Create initial super user");
		console.log("This command is for initial setup only.\n");

		const email = await ask("Email:", {after: "clear"});

		const password = await ask("Password:", {after: "clear"});

		const name = await ask("Name (optional, press Enter to skip):", {
			after: "clear",
		});

		console.log("\nCreating user...");

		try {
			const result = await graphqlRequest<{
				bootstrap: {
					id: string;
					email: string;
					name?: string;
				};
			}>(
				`
				mutation Bootstrap($email: String!, $password: String!, $name: String!) {
					bootstrap(email: $email, password: $password, name: $name) {
						id
						email
						name
					}
				}
			`,
				{email, password, name: name || ""},
			);

			if (result.errors) {
				throw new Error(result.errors[0]?.message || "Bootstrap failed");
			}

			if (!result.data?.bootstrap) {
				throw new Error("No user data returned from mutation");
			}

			const user = result.data.bootstrap;

			console.log("✅ User created successfully!");
			console.log(`ID: ${user.id}`);
			console.log(`Email: ${user.email}`);
			if (user.name) {
				console.log(`Name: ${user.name}`);
			}
			console.log("\n💡 You can now log in with: kampus login");
		} catch (error) {
			console.error("❌ Bootstrap failed:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	},
};
