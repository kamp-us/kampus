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
						try { controller.close(); } catch { /* stream already closed */ }
					});

					ws.addEventListener("error", (err) => {
						try { controller.error(err); } catch { /* stream already closed */ }
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

		const sandboxLayer = Layer.succeed(SandboxBinding, env.WORMHOLE_SANDBOX);
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

		const mux = new URL(request.url).searchParams.get("mux") === "1";

		this.runtime.runFork(
			Effect.gen(function* () {
				const handler = mux ? Server.handleMuxConnection : Server.handleConnection;
				console.log(`[WormholeDO] ${mux ? "handleMuxConnection" : "handleConnection"} starting`);
				const socket = yield* cfWebSocketToSocket(server);
				yield* handler(socket);
			}).pipe(
				Effect.catchAllCause((cause) =>
					Effect.sync(() => {
						console.error("[WormholeDO] handler failed:", cause.toString());
						try { server.close(1011, "Internal error"); } catch { /* already closed */ }
					}),
				),
				Effect.scoped,
			),
		);

		return new Response(null, {status: 101, webSocket: client});
	}
}
