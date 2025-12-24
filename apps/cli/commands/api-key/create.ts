import type {Props} from "bluebun";
import {getSessionToken} from "../../utils/config";
import {graphqlRequest} from "../../utils/graphql";

export default {
	name: "create",
	description: "Create a new API key",
	run: async (props: Props) => {
		const name = props.options.name as string | undefined;

		if (!name) {
			console.error("❌ Error: API key name is required");
			console.log("Usage: kampus api-key create --name <name>");
			process.exit(1);
		}

		const sessionToken = getSessionToken();
		if (!sessionToken) {
			console.error("❌ Error: You must be logged in to create an API key");
			console.log("Run 'kampus login' first");
			process.exit(1);
		}

		console.log(`Creating API key "${name}"...`);

		try {
			const result = await graphqlRequest<{
				createApiKey: {
					name: string;
					key: string;
				};
			}>(
				`
				mutation CreateApiKey($name: String!) {
					createApiKey(name: $name) {
						name
						key
					}
				}
			`,
				{name},
			);

			if (result.errors) {
				throw new Error(result.errors.map((e) => e.message).join(", "));
			}

			if (!result.data?.createApiKey) {
				throw new Error("No data returned from mutation");
			}

			const apiKey = result.data.createApiKey;

			console.log("✅ API key created successfully!");
			console.log(`Name: ${apiKey.name}`);
			console.log(`Key: ${apiKey.key}`);
			console.log("\n🔒 Save this key securely - it won't be shown again!");
		} catch (error) {
			console.error("❌ Failed to create API key:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	},
};
