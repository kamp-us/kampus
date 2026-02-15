import type {ITheme} from "ghostty-web";
import {useChannelTerminal} from "./use-channel-terminal.ts";
import {useMux} from "./MuxClient.tsx";
import styles from "./WormholeLayout.module.css";

interface TerminalPaneProps {
	channel: number;
	sessionId: string;
	focused: boolean;
	onFocus: () => void;
	theme?: ITheme;
}

export function TerminalPane({channel, sessionId, focused, onFocus, theme}: TerminalPaneProps) {
	const {ref} = useChannelTerminal({channel, sessionId, theme});
	const {splitPane, closePane} = useMux();

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: terminal handles keyboard events via ghostty-web
		// biome-ignore lint/a11y/noStaticElementInteractions: terminal container, not a button
		<div className={styles.pane} data-focused={focused || undefined} onClick={onFocus}>
			<div ref={ref} style={{flex: 1, minHeight: 0}} />
			<div className={styles.paneControls}>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane("vertical", 80, 24);
					}}
					title="Split right"
				>
					|
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane("horizontal", 80, 24);
					}}
					title="Split down"
				>
					—
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						closePane(sessionId);
					}}
					title="Close pane"
				>
					&times;
				</button>
			</div>
		</div>
	);
}
