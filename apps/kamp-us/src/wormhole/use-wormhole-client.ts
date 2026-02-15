// apps/kamp-us/src/wormhole/use-wormhole-client.ts
import {useCallback, useEffect, useRef, useState} from "react";
import {
	CONTROL_CHANNEL,
	parseBinaryFrame,
	encodeBinaryFrame,
	type ServerMessage,
	type ClientMessage,
} from "@kampus/sandbox/Protocol";

interface SessionRecord {
	id: string;
	sandboxId: string;
	name: string;
	createdAt: number;
}

interface TabRecord {
	id: string;
	sessionId: string;
	name: string;
	layout: unknown;
	focus: number[];
}

interface WormholeClientState {
	sessions: SessionRecord[];
	tabs: TabRecord[];
	activeTab: string | null;
	channels: Record<string, number>;
	connected: boolean;
}

interface WormholeClient {
	state: WormholeClientState;
	sendTerminalData: (channel: number, data: Uint8Array) => void;
	createSession: (name: string) => void;
	destroySession: (sessionId: string) => void;
	renameSession: (sessionId: string, name: string) => void;
	createTab: (sessionId: string, name: string) => void;
	closeTab: (tabId: string) => void;
	switchTab: (tabId: string) => void;
	renameTab: (tabId: string, name: string) => void;
	splitPane: (orientation: "horizontal" | "vertical", cols: number, rows: number) => void;
	closePane: (paneId: string) => void;
	resizePane: (paneId: string, cols: number, rows: number) => void;
	moveFocus: (direction: "left" | "right" | "up" | "down") => void;
	onTerminalData: (channel: number, callback: (data: Uint8Array) => void) => () => void;
}

export function useWormholeClient(
	url: string,
	viewport: {width: number; height: number},
): WormholeClient {
	const wsRef = useRef<WebSocket | null>(null);
	const terminalListeners = useRef(new Map<number, Set<(data: Uint8Array) => void>>());
	const [state, setState] = useState<WormholeClientState>({
		sessions: [],
		tabs: [],
		activeTab: null,
		channels: {},
		connected: false,
	});

	const sendControl = useCallback((msg: ClientMessage) => {
		if (!wsRef.current) return;
		const json = JSON.stringify(msg);
		const payload = new TextEncoder().encode(json);
		wsRef.current.send(encodeBinaryFrame(CONTROL_CHANNEL, payload));
	}, []);

	const sendTerminalData = useCallback((channel: number, data: Uint8Array) => {
		if (!wsRef.current) return;
		wsRef.current.send(encodeBinaryFrame(channel, data));
	}, []);

	useEffect(() => {
		const ws = new WebSocket(url);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onopen = () => {
			setState((s) => ({...s, connected: true}));
			sendControl({type: "connect", width: viewport.width, height: viewport.height});
		};

		ws.onmessage = (event) => {
			const data = new Uint8Array(event.data);
			const {channel, payload} = parseBinaryFrame(data);

			if (channel === CONTROL_CHANNEL) {
				const msg = JSON.parse(new TextDecoder().decode(payload)) as ServerMessage;
				handleServerMessage(msg);
			} else {
				const listeners = terminalListeners.current.get(channel);
				if (listeners) {
					for (const cb of listeners) cb(payload);
				}
			}
		};

		ws.onclose = () => {
			setState((s) => ({...s, connected: false}));
		};

		return () => {
			ws.close();
		};
	}, [url]);

	function handleServerMessage(msg: ServerMessage) {
		switch (msg.type) {
			case "state":
				setState((s) => ({
					...s,
					sessions: msg.sessions as SessionRecord[],
					tabs: msg.tabs as TabRecord[],
					activeTab: msg.activeTab,
					channels: msg.channels as Record<string, number>,
				}));
				break;
			case "layout_update":
				setState((s) => ({
					...s,
					tabs: msg.tabs as TabRecord[],
					activeTab: msg.activeTab,
					channels: msg.channels as Record<string, number>,
				}));
				break;
			case "session_exit":
				break;
			case "sessions_reset":
				break;
		}
	}

	const onTerminalData = useCallback(
		(channel: number, callback: (data: Uint8Array) => void) => {
			if (!terminalListeners.current.has(channel)) {
				terminalListeners.current.set(channel, new Set());
			}
			// biome-ignore lint/style/noNonNullAssertion: has() check above guarantees entry
			terminalListeners.current.get(channel)!.add(callback);
			return () => {
				terminalListeners.current.get(channel)?.delete(callback);
			};
		},
		[],
	);

	return {
		state,
		sendTerminalData,
		onTerminalData,
		createSession: (name) => sendControl({type: "session_create", name}),
		destroySession: (sessionId) => sendControl({type: "session_destroy", sessionId}),
		renameSession: (sessionId, name) => sendControl({type: "session_rename", sessionId, name}),
		createTab: (sessionId, name) => sendControl({type: "tab_create", sessionId, name}),
		closeTab: (tabId) => sendControl({type: "tab_close", tabId}),
		switchTab: (tabId) => sendControl({type: "tab_switch", tabId}),
		renameTab: (tabId, name) => sendControl({type: "tab_rename", tabId, name}),
		splitPane: (orientation, cols, rows) =>
			sendControl({type: "pane_split", orientation, cols, rows}),
		closePane: (paneId) => sendControl({type: "pane_close", paneId}),
		resizePane: (paneId, cols, rows) => sendControl({type: "pane_resize", paneId, cols, rows}),
		moveFocus: (direction) => sendControl({type: "pane_focus", direction}),
	};
}
