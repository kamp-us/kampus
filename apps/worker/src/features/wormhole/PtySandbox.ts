import type {Sandbox} from "@cloudflare/sandbox";
import {Deferred, Effect, Layer, Stream} from "effect";
import {PtySpawnError} from "@kampus/wormhole/Errors";
import {Pty, type PtyProcess, type SpawnOptions} from "@kampus/wormhole/Pty";
import {SandboxBinding} from "./SandboxBinding";

const spawnImpl = (
	binding: DurableObjectNamespace<Sandbox>,
	options: SpawnOptions,
): Effect.Effect<PtyProcess, PtySpawnError, never> =>
	Effect.gen(function* () {
		const sandboxId = options.env?.SANDBOX_ID ?? "default";
		const id = binding.idFromName(sandboxId);
		const stub = binding.get(id) as DurableObjectStub<Sandbox> & Sandbox;

		// Use Sandbox's terminal() API — connects to the container's built-in PTY
		// without needing an HTTP server listening inside the container.
		const upgradeReq = new Request("https://sandbox/terminal", {
			headers: new Headers({Upgrade: "websocket"}),
		});

		const resp = yield* Effect.tryPromise({
			try: () => stub.terminal(upgradeReq, {cols: options.cols, rows: options.rows}),
			catch: (cause) => new PtySpawnError({shell: "sandbox", cause}),
		});

		const ws = resp.webSocket;
		if (!ws) {
			return yield* new PtySpawnError({
				shell: "sandbox",
				cause: new Error("No WebSocket in terminal response"),
			});
		}
		ws.accept();

		const exitDeferred = yield* Deferred.make<number>();

		// ── Register WebSocket handlers IMMEDIATELY ──────────────
		// Unlike PtyLive where onExit is a separate callback, Sandbox
		// multiplexes control and data on a single WebSocket. We register
		// handlers eagerly so exit/close are detected even when the output
		// stream isn't being consumed.
		//
		// Data is buffered until the stream starts consuming, then flushed.
		let emitter: ((data: string) => void) | null = null;
		let endStream: (() => void) | null = null;
		const buffer: string[] = [];
		let ended = false;

		ws.addEventListener("message", (evt: MessageEvent) => {
			if (typeof evt.data === "string") {
				// Text frame — try parsing as JSON control message
				try {
					const msg = JSON.parse(evt.data);
					if (msg.type === "exit") {
						Effect.runSync(Deferred.succeed(exitDeferred, msg.code ?? 0));
						ended = true;
						endStream?.();
						return;
					}
					// Ignore "ready", "error", etc.
					return;
				} catch {
					// Not JSON — treat as text terminal data
					if (emitter) emitter(evt.data);
					else buffer.push(evt.data);
				}
			} else {
				// Binary frame — terminal output
				const text = new TextDecoder().decode(evt.data as ArrayBuffer);
				if (emitter) emitter(text);
				else buffer.push(text);
			}
		});

		ws.addEventListener("close", () => {
			Effect.runSync(Deferred.succeed(exitDeferred, 0));
			ended = true;
			endStream?.();
		});

		ws.addEventListener("error", () => {
			ended = true;
			endStream?.();
		});

		// ── Output stream (lazy consumption) ─────────────────────
		const output = Stream.asyncPush<string>((emit) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					// Flush any buffered data from before consumption started
					for (const data of buffer) emit.single(data);
					buffer.length = 0;
					if (ended) {
						emit.end();
						return;
					}
					// Wire up live data routing
					emitter = (data: string) => emit.single(data);
					endStream = () => emit.end();
				}),
				() =>
					Effect.sync(() => {
						try {
							ws.close();
						} catch {
							// WebSocket may already be closed
						}
					}),
			),
		);

		const guardAlive = (fn: () => void): Effect.Effect<void> =>
			Deferred.isDone(exitDeferred).pipe(
				Effect.flatMap((done) => (done ? Effect.void : Effect.sync(fn))),
			);

		return {
			output,
			awaitExit: Deferred.await(exitDeferred),
			write: (data: string) => guardAlive(() => ws.send(data)),
			resize: (cols: number, rows: number) =>
				guardAlive(() => ws.send(JSON.stringify({type: "resize", cols, rows}))),
		} satisfies PtyProcess;
	});

export const PtySandbox: Layer.Layer<Pty, never, SandboxBinding> = Layer.effect(
	Pty,
	Effect.gen(function* () {
		const binding = yield* SandboxBinding;
		return Pty.of({
			spawn: (options: SpawnOptions) => spawnImpl(binding, options),
		});
	}),
);
