// apps/kamp-us/src/wormhole/MuxClient.tsx
import {createContext, useContext, type ReactNode} from "react";
import {useWormholeClient} from "./use-wormhole-client.ts";
import {SessionBar} from "./SessionBar.tsx";
import {TabBar} from "./TabBar.tsx";
import {PaneLayout} from "./PaneLayout.tsx";
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
		return <div className={styles.container}>Connecting...</div>;
	}

	return (
		<MuxContext.Provider value={client}>
			<div className={styles.container}>
				<SessionBar />
				<TabBar />
				<PaneLayout />
			</div>
		</MuxContext.Provider>
	);
}
