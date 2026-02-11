import {DurableObject} from "cloudflare:workers";
import {Server, SessionStore} from "@kampus/wormhole";
import * as Socket from "@effect/platform/Socket";
import {Effect, Layer, ManagedRuntime} from "effect";
import {PtySandbox} from "./PtySandbox";
import {SandboxBinding} from "./SandboxBinding";

/**
 * Convert Cloudflare WebSocket to Effect Socket via TransformStream.
 *
 * CF WebSocket has different API than globalThis.WebSocket (`.accept()`, different events).
 * We bridge it using Web Streams API — create ReadableStream/WritableStream that proxy
 * WS messages to/from Effect's Socket interface.
 */
const cfWebSocketToSocket = (ws: WebSocket): Effect.Effect<Socket.Socket> => {
	const acquire = Effect.sync(
		(): Socket.InputTransformStream => ({
			readable: new ReadableStream<string | Uint8Array>({
				start(controller) {
					ws.addEventListener("message", (evt: MessageEvent) => {
						if (typeof evt.data === "string") {
							controller.enqueue(evt.data);
						} else {
							// Binary frame — convert ArrayBuffer to Uint8Array
							controller.enqueue(new Uint8Array(evt.data as ArrayBuffer));
						}
					});

					ws.addEventListener("close", () => {
						controller.close();
					});

					ws.addEventListener("error", (err) => {
						controller.error(err);
					});
				},
				cancel() {
					ws.close();
				},
			}),
			writable: new WritableStream<Uint8Array>({
				write(chunk) {
					ws.send(chunk);
				},
				close() {
					ws.close(1000);
				},
			}),
		}),
	);

	return Socket.fromTransformStream(acquire);
};

/**
 * WormholeDO — Durable Object that runs wormhole's Effect services.
 *
 * Lifecycle:
 * 1. Constructor: Initialize ManagedRuntime with SessionStore + PtySandbox layers
 * 2. fetch(): Accept WebSocket upgrade, convert to Effect Socket, run Server.handleConnection
 */
export class WormholeDO extends DurableObject<Env> {
	private runtime: ManagedRuntime.ManagedRuntime<SessionStore.SessionStore, never>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		// Build service layer: SessionStore → PtySandbox → SandboxBinding
		// FIXME(Task #8): WORMHOLE_SANDBOX binding not yet defined in wrangler.jsonc
		const sandboxLayer = Layer.succeed(
			SandboxBinding,
			(env as any).WORMHOLE_SANDBOX as DurableObjectNamespace<import("@cloudflare/sandbox").Sandbox>,
		);
		const sessionStoreLayer = SessionStore.SessionStore.Default.pipe(
			Layer.provide(PtySandbox),
			Layer.provide(sandboxLayer),
			// ConfigError from Config.number → crash on invalid config (DO shouldn't start)
			Layer.orDie,
		);

		this.runtime = ManagedRuntime.make(sessionStoreLayer);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket", {status: 400});
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();

		// Convert CF WebSocket to Effect Socket, run wormhole connection handler
		this.runtime.runFork(
			Effect.gen(function* () {
				const socket = yield* cfWebSocketToSocket(server);
				yield* Server.handleConnection(socket);
			}).pipe(Effect.scoped),
		);

		return new Response(null, {status: 101, webSocket: client});
	}
}
