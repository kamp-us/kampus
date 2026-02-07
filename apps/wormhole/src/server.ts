import http from "node:http";
import {URL} from "node:url";
import {WebSocketServer, type WebSocket} from "ws";

import type {SessionMessage} from "./protocol.ts";
import {parseMessage} from "./protocol.ts";
import type {PtySession} from "./pty-session.ts";
import {SessionStore} from "./session-store.ts";

const PORT = Number(process.env.PORT) || 8787;

console.log(`Starting wormhole server on port ${PORT}...`);

/**
 * Node http + ws WebSocket PTY server.
 *
 * - WebSocket at /ws
 * - Client must send {"type":"attach","sessionId":null|string,"cols":N,"rows":N} as first message
 * - Server responds with {"type":"session","sessionId":"uuid"}
 * - Subsequent messages are raw terminal I/O or resize controls
 * - On WS close, session is detached (not disposed) — client can reattach
 */

const store = new SessionStore();

interface WsBinding {
	session: PtySession;
	clientId: string;
}

const wsSessions = new Map<WebSocket, WsBinding>();

const server = http.createServer((_req, res) => {
	res.writeHead(200, {"Content-Type": "text/plain"});
	res.end(`wormhole — WebSocket PTY server\n\nConnect via ws://localhost:${PORT}/ws`);
});

const wss = new WebSocketServer({noServer: true});

server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

	if (url.pathname !== "/ws") {
		socket.destroy();
		return;
	}

	wss.handleUpgrade(req, socket, head, (ws) => {
		let attached = false;
		const clientId = crypto.randomUUID();

		ws.on("message", (data) => {
			const msg = typeof data === "string" ? data : data.toString("utf-8");

			if (!attached) {
				// First message must be an attach message
				const parsed = parseMessage(msg);
				if (!parsed || parsed.type !== "attach") {
					ws.close(4001, "First message must be attach");
					return;
				}

				const session = handleAttach(ws, clientId, parsed.sessionId, parsed.cols, parsed.rows);
				if (session) {
					attached = true;
					wsSessions.set(ws, {session, clientId});
				}
				return;
			}

			// Normal message flow — route to session
			const binding = wsSessions.get(ws);
			if (binding) {
				// Intercept resize messages to route through clientResize
				const parsed = parseMessage(msg);
				if (parsed?.type === "resize") {
					binding.session.clientResize(binding.clientId, parsed.cols, parsed.rows);
				} else {
					binding.session.handleMessage(msg);
				}
			}
		});

		ws.on("close", () => {
			const binding = wsSessions.get(ws);
			if (binding) {
				binding.session.detach(binding.clientId);
				wsSessions.delete(ws);
			}
		});
	});
});

function handleAttach(
	ws: WebSocket,
	clientId: string,
	sessionId: string | null,
	cols: number,
	rows: number,
): PtySession | null {
	let session: PtySession | undefined;

	// Try to join existing session
	if (sessionId) {
		session = store.get(sessionId);
	}

	// Create new session if none found or no sessionId
	if (!session) {
		const id = sessionId ?? crypto.randomUUID();
		session = store.create(id, cols, rows);
	}

	// Attach this client — no need to detach previous connections (multi-client)
	session.attach(
		clientId,
		(data) => ws.send(data),
		(exitCode) => {
			ws.send(`\r\n\x1b[33mShell exited (code: ${exitCode})\x1b[0m\r\n`);
			ws.close();
		},
		cols,
		rows,
	);

	// Send session confirmation
	const reply: SessionMessage = {type: "session", sessionId: session.id};
	ws.send(JSON.stringify(reply));

	return session;
}

server.listen(PORT, "0.0.0.0", () => {
	console.log(`wormhole listening on http://0.0.0.0:${PORT}`);
	console.log(`  WebSocket: ws://0.0.0.0:${PORT}/ws`);
});
