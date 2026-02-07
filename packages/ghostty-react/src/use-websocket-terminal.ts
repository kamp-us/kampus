import {useCallback, useEffect, useRef, useState} from "react";
import type {ITheme} from "ghostty-web";
import {useTerminal} from "./use-terminal.ts";

export type WebSocketStatus = "connecting" | "connected" | "disconnected";

export interface UseWebSocketTerminalOptions {
  url: string;
  sessionId?: string | null;
  fontSize?: number;
  fontFamily?: string;
  theme?: ITheme;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export interface UseWebSocketTerminalResult {
  ref: (element: HTMLDivElement | null) => void;
  status: WebSocketStatus;
  disconnect: () => void;
}

/**
 * Composed hook — wires useTerminal to a WebSocket connection.
 *
 * Protocol:
 * - On WS open, sends {"type":"attach","sessionId":id|null,"cols":N,"rows":N}
 * - Server responds with {"type":"session","sessionId":"uuid"}
 * - Subsequent messages: raw terminal I/O + JSON resize controls
 * - On reconnect, reattaches to the same PTY session via the sessionId prop
 */
export function useWebSocketTerminal(
  options: UseWebSocketTerminalOptions,
): UseWebSocketTerminalResult {
  const {
    url,
    sessionId = null,
    fontSize,
    fontFamily,
    theme,
    reconnect = true,
    reconnectInterval = 2000,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shouldReconnectRef = useRef(true);

  const {ref, write, terminal, ready} = useTerminal({
    fontSize,
    fontFamily,
    theme,
    onData: useCallback((data: string) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }, []),
    onResize: useCallback((size: {cols: number; rows: number}) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: "resize", cols: size.cols, rows: size.rows}));
      }
    }, []),
  });

  // Connect WebSocket when terminal is ready
  useEffect(() => {
    if (!ready || !terminal) return;

    shouldReconnectRef.current = true;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");

        // Send attach message with sessionId from URL (or null for new session)
        const attach = {
          type: "attach",
          sessionId,
          cols: terminal!.cols,
          rows: terminal!.rows,
        };
        ws.send(JSON.stringify(attach));
      };

      ws.onmessage = (event) => {
        // Intercept session confirmation messages — don't write to terminal
        if (typeof event.data === "string" && event.data.startsWith("{")) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "session" && typeof msg.sessionId === "string") {
              return;
            }
          } catch {
            // Not JSON — fall through to write
          }
        }
        write(event.data);
      };

      ws.onclose = () => {
        setStatus("disconnected");
        wsRef.current = null;

        if (reconnect && shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [ready, terminal, url, sessionId, write, reconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return {ref, status, disconnect};
}
