import type {ITheme} from "ghostty-web";
import {useMux} from "./MuxClient.tsx";
import {useChannelTerminal} from "./use-channel-terminal.ts";
import styles from "./WormholeLayout.module.css";

interface TerminalPaneProps {
	channel: number;
	sessionId: string;
	focused: boolean;
	connected: boolean;
	onFocus: () => void;
	theme?: ITheme;
}

export function TerminalPane({
	channel,
	sessionId,
	focused,
	connected,
	onFocus,
	theme,
}: TerminalPaneProps) {
	const {ref} = useChannelTerminal({channel, sessionId, fontFamily: "JetBrains Mono", theme});
	const {splitPane, closePane} = useMux();

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: terminal handles keyboard events via ghostty-web
		// biome-ignore lint/a11y/noStaticElementInteractions: terminal container, not a button
		<div className={styles.pane} data-focused={focused || undefined} onClick={onFocus}>
			<div className={styles.terminalContent}>
				<div ref={ref} style={{width: "100%", height: "100%"}} />
			</div>
			{!connected && (
				<div className={styles.disconnectedOverlay}>
					<div className={styles.disconnectedCard}>
						<div className={styles.disconnectedDot} />
						<span className={styles.disconnectedTitle}>Disconnected</span>
						<span className={styles.disconnectedHint}>press any key to reconnect</span>
					</div>
				</div>
			)}
			<div className={styles.paneControls}>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane(sessionId, "vertical", 80, 24);
					}}
					title="Split right"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 14 14"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.3"
					>
						<rect x="1.5" y="1.5" width="4.5" height="11" rx="0.5" />
						<rect x="8" y="1.5" width="4.5" height="11" rx="0.5" />
					</svg>
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane(sessionId, "horizontal", 80, 24);
					}}
					title="Split down"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 14 14"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.3"
					>
						<rect x="1.5" y="1.5" width="11" height="4.5" rx="0.5" />
						<rect x="1.5" y="8" width="11" height="4.5" rx="0.5" />
					</svg>
				</button>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={(e) => {
						e.stopPropagation();
						closePane(sessionId);
					}}
					title="Close pane"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 14 14"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					>
						<line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
						<line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
					</svg>
				</button>
			</div>
		</div>
	);
}
