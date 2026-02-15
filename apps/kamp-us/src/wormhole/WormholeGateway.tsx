import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

const CONTROL_CHANNEL = 255;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBinaryFrame(channel: number, payload: Uint8Array): Uint8Array {
	const frame = new Uint8Array(1 + payload.length);
	frame[0] = channel;
	frame.set(payload, 1);
	return frame;
}

function parseBinaryFrame(frame: Uint8Array): {channel: number; payload: Uint8Array} {
	return {channel: frame[0], payload: frame.subarray(1)};
}

function useEventListeners<T>(): [React.RefObject<Set<(value: T) => void>>, (cb: (value: T) => void) => () => void] {
	const ref = useRef(new Set<(value: T) => void>());
	const subscribe = useCallback((cb: (value: T) => void) => {
		ref.current.add(cb);
		return () => {
			ref.current.delete(cb);
		};
	}, []);
	return [ref, subscribe];
}

export type GatewayStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SessionCreatedEvent {
	sessionId: string;
	channel: number;
}

export interface SessionExitEvent {
	sessionId: string;
	channel: number;
	exitCode: number;
}

export interface SessionInfo {
	id: string;
	clientCount: number;
}

export interface WormholeGatewayValue {
	status: GatewayStatus;
	createSession: (cols: number, rows: number) => void;
	attachSession: (sessionId: string, cols: number, rows: number) => void;
	detachSession: (sessionId: string) => void;
	destroySession: (sessionId: string) => void;
	resizeSession: (sessionId: string, cols: number, rows: number) => void;
	listSessions: () => void;
	sendInput: (channel: number, data: string) => void;
	subscribe: (channel: number, listener: (data: Uint8Array) => void) => () => void;
	onSessionCreated: (cb: (event: SessionCreatedEvent) => void) => () => void;
	onSessionExit: (cb: (event: SessionExitEvent) => void) => () => void;
	onSessionList: (cb: (sessions: SessionInfo[]) => void) => () => void;
}

const WormholeGatewayContext = createContext<WormholeGatewayValue | null>(null);

export function useWormholeGateway(): WormholeGatewayValue {
	const ctx = useContext(WormholeGatewayContext);
	if (!ctx) throw new Error("useWormholeGateway must be within WormholeGateway");
	return ctx;
}

interface WormholeGatewayProps {
	url: string;
	children: ReactNode;
}

export function WormholeGateway({url, children}: WormholeGatewayProps) {
	const [status, setStatus] = useState<GatewayStatus>("disconnected");
	const wsRef = useRef<WebSocket | null>(null);
	const channelListeners = useRef(new Map<number, Set<(data: Uint8Array) => void>>());
	const channelBuffers = useRef(new Map<number, Uint8Array[]>());
	const [createdListeners, onSessionCreated] = useEventListeners<SessionCreatedEvent>();
	const [exitListeners, onSessionExit] = useEventListeners<SessionExitEvent>();
	const [listListeners, onSessionList] = useEventListeners<SessionInfo[]>();

	const sendControl = useCallback((msg: object) => {
		const ws = wsRef.current;
		if (ws?.readyState !== WebSocket.OPEN) return;
		const json = encoder.encode(JSON.stringify(msg));
		ws.send(encodeBinaryFrame(CONTROL_CHANNEL, json));
	}, []);

	const sendInput = useCallback((channel: number, data: string) => {
		const ws = wsRef.current;
		if (ws?.readyState !== WebSocket.OPEN) return;
		ws.send(encodeBinaryFrame(channel, encoder.encode(data)));
	}, []);

	const subscribe = useCallback((channel: number, listener: (data: Uint8Array) => void) => {
		if (!channelListeners.current.has(channel)) {
			channelListeners.current.set(channel, new Set());
		}
		channelListeners.current.get(channel)?.add(listener);

		// Flush any data that arrived before this subscriber registered
		const buffered = channelBuffers.current.get(channel);
		if (buffered) {
			channelBuffers.current.delete(channel);
			for (const data of buffered) listener(data);
		}

		return () => {
			channelListeners.current.get(channel)?.delete(listener);
		};
	}, []);

	useEffect(() => {
		let disposed = false;
		let attempt = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function connect(isReconnect: boolean) {
			if (disposed) return;

			setStatus(isReconnect ? "reconnecting" : "connecting");

			// Schedule actual WS creation after backoff (immediate on first connect)
			const delay = isReconnect
				? Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000
				: 0;

			reconnectTimer = setTimeout(() => {
				if (disposed) return;
				reconnectTimer = null;
				setStatus("connecting");

				const ws = new WebSocket(url);
				ws.binaryType = "arraybuffer";
				wsRef.current = ws;

				ws.onopen = () => {
					if (disposed) return;
					attempt = 0;
					setStatus("connected");
				};

				ws.onmessage = (event) => {
					if (disposed) return;
					const frame = new Uint8Array(event.data as ArrayBuffer);
					const {channel, payload} = parseBinaryFrame(frame);

					if (channel === CONTROL_CHANNEL) {
						const msg = JSON.parse(decoder.decode(payload));
						switch (msg.type) {
							case "session_created":
								for (const cb of createdListeners.current) cb(msg);
								break;
							case "session_exit":
								for (const cb of exitListeners.current) cb(msg);
								break;
							case "session_list":
								for (const cb of listListeners.current) cb(msg.sessions);
								break;
						}
						return;
					}

					const listeners = channelListeners.current.get(channel);
					if (listeners && listeners.size > 0) {
						for (const listener of listeners) listener(payload);
					} else {
						if (!channelBuffers.current.has(channel)) {
							channelBuffers.current.set(channel, []);
						}
						channelBuffers.current.get(channel)!.push(payload);
					}
				};

				ws.onclose = () => {
					if (disposed) return;
					wsRef.current = null;
					attempt++;
					connect(true);
				};

				ws.onerror = () => {
					// onerror is always followed by onclose — no action needed here
				};
			}, delay);
		}

		connect(false);

		return () => {
			disposed = true;
			if (reconnectTimer != null) clearTimeout(reconnectTimer);
			wsRef.current?.close();
			wsRef.current = null;
		};
	}, [url]);

	const value: WormholeGatewayValue = {
		status,
		createSession: (cols, rows) => sendControl({type: "session_create", cols, rows}),
		attachSession: (sessionId, cols, rows) =>
			sendControl({type: "session_attach", sessionId, cols, rows}),
		detachSession: (sessionId) => sendControl({type: "session_detach", sessionId}),
		destroySession: (sessionId) => sendControl({type: "session_destroy", sessionId}),
		resizeSession: (sessionId, cols, rows) =>
			sendControl({type: "session_resize", sessionId, cols, rows}),
		listSessions: () => sendControl({type: "session_list_request"}),
		sendInput,
		subscribe,
		onSessionCreated,
		onSessionExit,
		onSessionList,
	};

	return (
		<WormholeGatewayContext.Provider value={value}>{children}</WormholeGatewayContext.Provider>
	);
}
