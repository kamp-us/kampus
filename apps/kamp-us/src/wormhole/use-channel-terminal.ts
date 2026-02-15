import {useTerminal} from "@kampus/ghostty-react";
import type {ITheme} from "ghostty-web";
import {useCallback, useEffect, useRef} from "react";
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
	const {sendTerminalData, resizePane, onTerminalData} = useMux();

	// Stable refs so ghostty onData/onResize closures never go stale
	const sendRef = useRef(sendTerminalData);
	sendRef.current = sendTerminalData;
	const resizeRef = useRef(resizePane);
	resizeRef.current = resizePane;

	const onData = useCallback(
		(data: string) => sendRef.current(channel, new TextEncoder().encode(data)),
		[channel],
	);
	const onResize = useCallback(
		(size: {cols: number; rows: number}) => resizeRef.current(sessionId, size.cols, size.rows),
		[sessionId],
	);

	const {ref, write, terminal, ready} = useTerminal({
		fontSize,
		fontFamily,
		theme,
		onData,
		onResize,
	});

	useEffect(() => {
		if (!ready) return;
		return onTerminalData(channel, (data) => write(data));
	}, [ready, channel, onTerminalData, write]);

	// Let layout keybindings (Ctrl+Shift combos) pass through the terminal
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
