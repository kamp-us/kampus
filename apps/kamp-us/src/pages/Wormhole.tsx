import {WormholeGateway} from "../wormhole/WormholeGateway.tsx";
import {WormholeLayout} from "../wormhole/WormholeLayout.tsx";

const wsUrl = import.meta.env.VITE_WORMHOLE_WS_URL || "ws://localhost:3000/ws";

export function Wormhole() {
	// Append ?mux=1 to signal multiplexed mode
	const muxUrl = wsUrl.includes("?") ? `${wsUrl}&mux=1` : `${wsUrl}?mux=1`;

	return (
		<WormholeGateway url={muxUrl}>
			<WormholeLayout />
		</WormholeGateway>
	);
}
