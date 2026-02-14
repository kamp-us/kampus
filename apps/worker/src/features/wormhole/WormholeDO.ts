import {DurableObject} from "cloudflare:workers";
import {Server, SessionStore} from "@kampus/wormhole";
import {Effect, Layer, ManagedRuntime} from "effect";
import {PtySandbox} from "./PtySandbox";
import {SandboxBinding} from "./SandboxBinding";

export class WormholeDO extends DurableObject<Env> {
	private runtime: ManagedRuntime.ManagedRuntime<SessionStore.SessionStore, never>;
	private activeHandler: Server.MuxHandler | null = null;
	private activeWs: WebSocket | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		const sandboxLayer = Layer.succeed(SandboxBinding, env.WORMHOLE_SANDBOX);
		const sessionStoreLayer = SessionStore.SessionStore.Default.pipe(
			Layer.provide(PtySandbox),
			Layer.provide(sandboxLayer),
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

		// Clean up previous connection
		if (this.activeHandler) {
			this.runtime.runFork(this.activeHandler.cleanup);
		}
		if (this.activeWs) {
			try {
				this.activeWs.close(1000, "Replaced by new connection");
			} catch {
				/* already closed */
			}
		}

		server.accept();

		const send = (data: Uint8Array) =>
			Effect.sync(() => {
				try {
					server.send(data);
				} catch {
					/* ws already closed */
				}
			});
		const close = (code: number, reason: string) =>
			Effect.sync(() => {
				try {
					server.close(code, reason);
				} catch {
					/* ws already closed */
				}
			});

		const handler = await this.runtime.runPromise(Server.makeMuxHandler({send, close}));
		this.activeHandler = handler;
		this.activeWs = server;

		server.addEventListener("message", (evt: MessageEvent) => {
			const data =
				evt.data instanceof ArrayBuffer
					? new Uint8Array(evt.data)
					: new TextEncoder().encode(evt.data as string);
			this.runtime.runFork(handler.handleMessage(data));
		});

		server.addEventListener("close", () => {
			this.runtime.runFork(handler.cleanup);
			this.activeHandler = null;
			this.activeWs = null;
		});

		server.addEventListener("error", () => {
			this.runtime.runFork(handler.cleanup);
			try {
				server.close(1011, "Internal error");
			} catch {
				/* already closed */
			}
			this.activeHandler = null;
			this.activeWs = null;
		});

		return new Response(null, {status: 101, webSocket: client});
	}
}
