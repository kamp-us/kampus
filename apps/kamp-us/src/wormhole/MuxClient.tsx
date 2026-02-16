// apps/kamp-us/src/wormhole/MuxClient.tsx
import {createContext, useContext} from "react";
import {ChromeBar} from "./ChromeBar.tsx";
import {PaneLayout} from "./PaneLayout.tsx";
import {useWormholeClient} from "./use-wormhole-client.ts";
import styles from "./WormholeLayout.module.css";

type WormholeClient = ReturnType<typeof useWormholeClient>;
const MuxContext = createContext<WormholeClient | null>(null);

export function useMux(): WormholeClient {
	const ctx = useContext(MuxContext);
	if (!ctx) throw new Error("useMux must be within MuxClient");
	return ctx;
}

interface MuxClientProps {
	url: string;
	viewport: {width: number; height: number};
}

export function MuxClient({url, viewport}: MuxClientProps) {
	const client = useWormholeClient(url, viewport);

	if (!client.state.connected) {
		return (
			<div className={styles.container} data-wormhole>
				<div className={styles.connecting}>
					<div className={styles.connectingSpinner} />
					<span className={styles.connectingText}>Connecting...</span>
				</div>
			</div>
		);
	}

	return (
		<MuxContext.Provider value={client}>
			<div className={styles.container} data-wormhole>
				<ChromeBar />
				<PaneLayout />
			</div>
		</MuxContext.Provider>
	);
}
