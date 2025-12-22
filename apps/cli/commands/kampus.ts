import type {Props} from "bluebun";

export default {
	name: "kampus",
	description: "kampus cli",
	run: async (props: Props) => {
		console.log("Welcome to Kampus CLI!", props, process.cwd());
	},
};
