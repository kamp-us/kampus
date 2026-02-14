import type {ITheme} from "ghostty-web";
import {useChannelTerminal} from "./use-channel-terminal.ts";
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

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: terminal handles keyboard events via ghostty-web
		// biome-ignore lint/a11y/noStaticElementInteractions: terminal container, not a button
		<div className={styles.pane} data-focused={focused || undefined} onClick={onFocus} ref={ref} />
	);
}
