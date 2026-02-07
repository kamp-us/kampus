import {Container} from "@cloudflare/containers";

export class WormholeContainer extends Container {
	defaultPort = 8787;
	sleepAfter = "2m";
	enableInternet = true;

	envVars = {
		PORT: "8787",
	};

	onError(error: unknown) {
		console.log("Wormhole container error:", error);
	}
}
