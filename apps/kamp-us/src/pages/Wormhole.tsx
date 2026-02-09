import {GhosttyTerminal} from "@kampus/ghostty-react";
import type {ITheme} from "ghostty-web";
import {Navigate, useParams} from "react-router";
import styles from "./Wormhole.module.css";

const theme: ITheme = {background: "#1e1e1e", foreground: "#d4d4d4"};
const wsUrl = import.meta.env.VITE_WORMHOLE_WS_URL || "ws://localhost:3000/ws";

export function Wormhole() {
	const {sessionId} = useParams<{sessionId: string}>();

	// No sessionId in URL → redirect to a fresh random session
	if (!sessionId) {
		return <Navigate to={`/wormhole/${crypto.randomUUID()}`} replace />;
	}

	console.log("Connecting to Wormhole session:", sessionId, wsUrl);

	return (
		<GhosttyTerminal url={wsUrl} sessionId={sessionId} className={styles.container} theme={theme} />
	);
}
