import {useTerminal} from "@kampus/ghostty-react";
import type {ITheme} from "ghostty-web";
import {useEffect} from "react";
import {useMux} from "./MuxClient.tsx";

export interface UseChannelTerminalOptions {
	channel: number;
	sessionId: string;
	fontSize?: number;
	fontFamily?: string;
	theme?: ITheme;
}

export function useChannelTerminal(options: UseChannelTerminalOptions) {
	const {channel, sessionId, fontSize, fontFamily, theme} = options;
	const mux = useMux();

	const {ref, write, terminal, ready} = useTerminal({
		fontSize,
		fontFamily,
		theme,
		onData: (data) => mux.sendTerminalData(channel, new TextEncoder().encode(data)),
		onResize: (size) => mux.resizePane(sessionId, size.cols, size.rows),
	});

	useEffect(() => {
		if (!ready) return;
		return mux.onTerminalData(channel, (data) => write(data));
	}, [ready, channel, mux, write]);

	// Let layout keybindings (Ctrl+Shift combos) pass through the terminal
	// ghostty-web: return true = "consumed, preventDefault (no stopPropagation)", false = "not handled"
	useEffect(() => {
		if (!terminal) return;
		terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey) {
				switch (e.code) {
					case "KeyD":
					case "KeyE":
					case "KeyW":
					case "ArrowLeft":
					case "ArrowRight":
					case "ArrowUp":
					case "ArrowDown":
						return true;
				}
			}
			return false;
		});
	}, [terminal]);

	return {ref, terminal, ready};
}
