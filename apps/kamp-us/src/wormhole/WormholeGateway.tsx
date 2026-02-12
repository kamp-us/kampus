import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from "react";

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

export type GatewayStatus = "connecting" | "connected" | "disconnected";

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

export function WormholeGateway({url, children}: {url: string; children: ReactNode}) {
  const [status, setStatus] = useState<GatewayStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const channelListeners = useRef(new Map<number, Set<(data: Uint8Array) => void>>());
  const createdListeners = useRef(new Set<(e: SessionCreatedEvent) => void>());
  const exitListeners = useRef(new Set<(e: SessionExitEvent) => void>());
  const listListeners = useRef(new Set<(s: SessionInfo[]) => void>());

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
    channelListeners.current.get(channel)!.add(listener);
    return () => {
      channelListeners.current.get(channel)?.delete(listener);
    };
  }, []);

  const onSessionCreated = useCallback((cb: (e: SessionCreatedEvent) => void) => {
    createdListeners.current.add(cb);
    return () => {
      createdListeners.current.delete(cb);
    };
  }, []);

  const onSessionExit = useCallback((cb: (e: SessionExitEvent) => void) => {
    exitListeners.current.add(cb);
    return () => {
      exitListeners.current.delete(cb);
    };
  }, []);

  const onSessionList = useCallback((cb: (s: SessionInfo[]) => void) => {
    listListeners.current.add(cb);
    return () => {
      listListeners.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    setStatus("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (event) => {
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
      if (listeners) {
        for (const listener of listeners) listener(payload);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  const value: WormholeGatewayValue = {
    status,
    createSession: (cols, rows) => sendControl({type: "session_create", cols, rows}),
    attachSession: (sessionId, cols, rows) => sendControl({type: "session_attach", sessionId, cols, rows}),
    detachSession: (sessionId) => sendControl({type: "session_detach", sessionId}),
    resizeSession: (sessionId, cols, rows) => sendControl({type: "session_resize", sessionId, cols, rows}),
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
