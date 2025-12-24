import type {Props} from "bluebun";

export default {
	name: "kampus",
	description: "Kampus CLI - Admin tools for managing API keys",
	commands: [
		() => import("./login"),
		() => import("./bootstrap"),
		() => import("./api-key/api-key"),
	],
	run: async (props: Props) => {
		console.log("Welcome to Kampus CLI!");
		console.log("\nAvailable commands:");
		console.log("  kampus bootstrap         - Bootstrap initial super user (initial setup)");
		console.log("  kampus login              - Login with superuser credentials");
		console.log("  kampus api-key create    - Create a new API key");
		console.log("\nUse 'kampus <command> --help' for more information.");
	},
};
