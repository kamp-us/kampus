import {MuxClient} from "../wormhole/MuxClient.tsx";

const wsUrl = import.meta.env.VITE_SANDBOX_WS_URL || "ws://localhost:8787/sandbox/ws";

export function Sandbox() {
	return (
		<MuxClient
			url={wsUrl}
			viewport={{ width: window.innerWidth, height: window.innerHeight }}
		/>
	);
}
