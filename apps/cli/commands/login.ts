import {ask, type Props} from "bluebun";
import {getWorkerUrl, saveConfig} from "../utils/config";

export default {
	name: "login",
	description: "Login with superuser credentials",
	run: async (_props: Props) => {
		const email = await ask("Email:", {after: "clear"});

		const password = await ask("Password:", {after: "clear"});

		const workerUrl = getWorkerUrl();
		console.log(`Logging in to ${workerUrl}...`);

		try {
			const response = await fetch(`${workerUrl}/api/auth/sign-in/email`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email,
					password,
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as {
				token?: string;
				user?: {
					id: string;
					email: string;
					name?: string;
				};
			};

			if (!result.token) {
				throw new Error("No session token returned from server");
			}

			// Save session token and user info
			saveConfig({
				sessionToken: result.token,
				user: result.user,
			});

			console.log("✅ Successfully logged in!");
			console.log(`User: ${result.user?.email || email}`);
		} catch (error) {
			console.error("❌ Login failed:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	},
};
