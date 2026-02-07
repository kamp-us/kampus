import {GhosttyTerminal} from "@kampus/ghostty-react";
import type {ITheme} from "ghostty-web";
import {Navigate, useParams} from "react-router";
import styles from "./Wormhole.module.css";

const theme: ITheme = {background: "#1e1e1e", foreground: "#d4d4d4"};

export function Wormhole() {
	const {sessionId} = useParams<{sessionId: string}>();

	// No sessionId in URL → redirect to a fresh random session
	if (!sessionId) {
		return <Navigate to={`/wormhole/${crypto.randomUUID()}`} replace />;
	}

	return (
		<GhosttyTerminal
			url="ws://localhost:3001/ws"
			sessionId={sessionId}
			className={styles.container}
			theme={theme}
		/>
	);
}
