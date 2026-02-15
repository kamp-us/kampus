import {DurableObject} from "cloudflare:workers";
import {Server, SessionCheckpoint, SessionStore} from "@kampus/wormhole";
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

		// Hydrate sessions from DO storage on wake
		ctx.blockConcurrencyWhile(async () => {
			const stored = await ctx.storage.list<SessionCheckpoint.SessionCheckpoint>({prefix: "session:"});
			if (stored.size === 0) return;

			const restoreAll = Effect.gen(function* () {
				const store = yield* SessionStore.SessionStore;
				for (const [, checkpoint] of stored) {
					yield* store.restore(checkpoint);
				}
			});

			await this.runtime.runPromise(restoreAll);
		});
	}

	private cleanupConnection(): void {
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
		this.activeHandler = null;
		this.activeWs = null;
	}

	private async checkpointAll(): Promise<void> {
		const checkpointEffect = Effect.gen(function* () {
			const store = yield* SessionStore.SessionStore;
			const sessions = yield* store.list();
			const checkpoints: SessionCheckpoint.SessionCheckpoint[] = [];
			for (const entry of sessions) {
				const session = yield* store.get(entry.id);
				if (session) {
					const cp = yield* session.checkpoint;
					checkpoints.push(cp);
				}
			}
			return checkpoints;
		});

		const checkpoints = await this.runtime.runPromise(checkpointEffect);

		// Batch write all checkpoints
		const batch: Record<string, SessionCheckpoint.SessionCheckpoint> = {};
		for (const cp of checkpoints) batch[`session:${cp.id}`] = cp;
		await this.ctx.storage.put(batch);

		// GC orphaned storage keys
		const stored = await this.ctx.storage.list({prefix: "session:"});
		const activeIds = new Set(checkpoints.map((cp) => `session:${cp.id}`));
		const orphanKeys: string[] = [];
		for (const key of stored.keys()) {
			if (!activeIds.has(key)) orphanKeys.push(key);
		}
		if (orphanKeys.length > 0) await this.ctx.storage.delete(orphanKeys);
	}

	async alarm(): Promise<void> {
		await this.checkpointAll();
		// Re-arm alarm for next checkpoint cycle
		await this.ctx.storage.setAlarm(Date.now() + 30_000);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket", {status: 400});
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.cleanupConnection();
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

		// Arm checkpoint alarm on first connection
		await this.ctx.storage.setAlarm(Date.now() + 30_000);

		server.addEventListener("message", (evt: MessageEvent) => {
			const data =
				evt.data instanceof ArrayBuffer
					? new Uint8Array(evt.data)
					: new TextEncoder().encode(evt.data as string);
			this.runtime.runFork(handler.handleMessage(data));
		});

		server.addEventListener("close", async () => {
			// Checkpoint before cleanup so session state survives disconnect
			await this.checkpointAll();
			this.cleanupConnection();
		});

		server.addEventListener("error", () => {
			try {
				server.close(1011, "Internal error");
			} catch {
				/* already closed */
			}
			this.cleanupConnection();
		});

		return new Response(null, {status: 101, webSocket: client});
	}
}
