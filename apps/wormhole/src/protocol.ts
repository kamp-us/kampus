/**
 * Shared protocol types for wormhole WebSocket communication.
 *
 * Wire protocol:
 * - Raw string data flows bidirectionally for terminal I/O
 * - JSON control messages: resize, attach
 * - Server → client: session (confirms attach with sessionId)
 */

export interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

export interface AttachMessage {
  type: "attach";
  sessionId: string | null;
  cols: number;
  rows: number;
}

export interface SessionMessage {
  type: "session";
  sessionId: string;
}

export type ControlMessage = ResizeMessage | AttachMessage;

export function parseMessage(data: string): ControlMessage | null {
  if (!data.startsWith("{")) return null;

  try {
    const msg = JSON.parse(data);
    if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
      return msg as ResizeMessage;
    }
    if (
      msg.type === "attach" &&
      (msg.sessionId === null || typeof msg.sessionId === "string") &&
      typeof msg.cols === "number" &&
      typeof msg.rows === "number"
    ) {
      return msg as AttachMessage;
    }
  } catch {
    // Not JSON — treat as raw terminal input
  }

  return null;
}
