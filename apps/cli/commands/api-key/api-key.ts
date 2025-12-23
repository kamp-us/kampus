import type {Props} from "bluebun";

export default {
	name: "api-key",
	description: "Manage API keys",
	run: async (_props: Props) => {
		console.log("API Key Management");
		console.log("\nAvailable commands:");
		console.log("  kampus api-key create --name <name>  - Create a new API key");
		console.log("\nUse 'kampus api-key <command> --help' for more information.");
	},
};
