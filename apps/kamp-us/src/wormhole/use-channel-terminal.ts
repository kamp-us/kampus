import {useTerminal} from "@kampus/ghostty-react";
import type {ITheme} from "ghostty-web";
import {useEffect} from "react";
import {useWormholeGateway} from "./WormholeGateway.tsx";

export interface UseChannelTerminalOptions {
	channel: number;
	sessionId: string;
	fontSize?: number;
	fontFamily?: string;
	theme?: ITheme;
}

export function useChannelTerminal(options: UseChannelTerminalOptions) {
	const {channel, sessionId, fontSize, fontFamily, theme} = options;
	const gateway = useWormholeGateway();

	const {ref, write, terminal, ready} = useTerminal({
		fontSize,
		fontFamily,
		theme,
		onData: (data) => gateway.sendInput(channel, data),
		onResize: (size) => gateway.resizeSession(sessionId, size.cols, size.rows),
	});

	useEffect(() => {
		if (!ready) return;
		return gateway.subscribe(channel, (data) => write(data));
	}, [ready, channel, gateway, write]);

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
