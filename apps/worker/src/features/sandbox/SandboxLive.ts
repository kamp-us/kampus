import type {Sandbox as CfSandbox} from "@cloudflare/sandbox";
import {ExecError, FileSystemError, TerminalError} from "@kampus/sandbox/Errors";
import {
	type ExecOptions,
	type ProcessOptions,
	Sandbox,
	type Session,
	type SessionOptions,
	type Terminal,
	type TerminalOptions,
} from "@kampus/sandbox/Sandbox";
import {Deferred, Effect, Layer, Stream} from "effect";
import {SandboxBinding} from "./SandboxBinding";

// -- WebSocket -> Terminal adapter ------------------------------------------
// Same pattern as PtySandbox.ts: eagerly register WS handlers, buffer
// data until stream consumption starts.

const makeTerminal = (ws: WebSocket): Effect.Effect<Terminal> =>
	Effect.gen(function* () {
		const exitDeferred = yield* Deferred.make<number>();

		let emitter: ((data: string) => void) | null = null;
		let endStream: (() => void) | null = null;
		const buffer: string[] = [];
		let ended = false;

		ws.addEventListener("message", (evt: MessageEvent) => {
			if (typeof evt.data === "string") {
				try {
					const msg = JSON.parse(evt.data);
					if (msg.type === "exit") {
						Effect.runSync(Deferred.succeed(exitDeferred, msg.code ?? 0));
						ended = true;
						endStream?.();
						return;
					}
					return;
				} catch {
					if (emitter) emitter(evt.data);
					else buffer.push(evt.data);
				}
			} else {
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

		const output = Stream.asyncPush<string>((emit) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					for (const data of buffer) emit.single(data);
					buffer.length = 0;
					if (ended) {
						emit.end();
						return;
					}
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
			write: (data: string) => guardAlive(() => ws.send(new TextEncoder().encode(data))),
			resize: (cols: number, rows: number) =>
				guardAlive(() => ws.send(JSON.stringify({type: "resize", cols, rows}))),
		} satisfies Terminal;
	});

// -- Wrap CF session -> our Session interface -------------------------------

const wrapSession = (
	binding: DurableObjectNamespace<CfSandbox>,
	sandboxId: string,
	cfSessionId: string,
): Session => ({
	id: cfSessionId,
	terminal: (options: TerminalOptions) =>
		Effect.gen(function* () {
			const id = binding.idFromName(sandboxId);
			const stub = binding.get(id);

			const params = new URLSearchParams({sessionId: cfSessionId});
			params.set("cols", String(options.cols));
			params.set("rows", String(options.rows));

			const upgradeReq = new Request(`http://localhost:3000/ws/pty?${params}`, {
				headers: new Headers({Upgrade: "websocket", Connection: "Upgrade"}),
			});

			const resp = yield* Effect.tryPromise({
				try: () => stub.fetch(upgradeReq),
				catch: (cause) => new TerminalError({cause}),
			});
			const ws = resp.webSocket;
			if (!ws) {
				return yield* new TerminalError({
					cause: new Error("No WebSocket in terminal response"),
				});
			}
			ws.accept();

			return yield* makeTerminal(ws);
		}),
	exec: (command: string, _options?: ExecOptions) =>
		Effect.tryPromise({
			try: async () => ({success: true, stdout: "", stderr: "", exitCode: 0}),
			catch: (cause) => new ExecError({command, cause}),
		}),
	execStream: (command: string, _options?: ExecOptions) =>
		Effect.tryPromise({
			try: async () => Stream.empty as Stream.Stream<never>,
			catch: (cause) => new ExecError({command, cause}),
		}),
	startProcess: (command: string, _options?: ProcessOptions) =>
		Effect.tryPromise({
			try: async () => ({
				id: crypto.randomUUID(),
				kill: () => Effect.void,
				getLogs: () => Effect.succeed(""),
				waitForExit: () => Effect.succeed(0),
			}),
			catch: (cause) => new ExecError({command, cause}),
		}),
	readFile: (path: string) =>
		Effect.tryPromise({
			try: async () => "",
			catch: (cause) => new FileSystemError({path, operation: "read", cause}),
		}),
	writeFile: (path: string, _content: string) =>
		Effect.tryPromise({
			try: async () => {},
			catch: (cause) => new FileSystemError({path, operation: "write", cause}),
		}),
	mkdir: (path: string) =>
		Effect.tryPromise({
			try: async () => {},
			catch: (cause) => new FileSystemError({path, operation: "mkdir", cause}),
		}),
	deleteFile: (path: string) =>
		Effect.tryPromise({
			try: async () => {},
			catch: (cause) => new FileSystemError({path, operation: "delete", cause}),
		}),
	setEnvVars: () => Effect.void,
});

// -- SandboxLive Layer ------------------------------------------------------

export const SandboxLive = Layer.effect(
	Sandbox,
	Effect.gen(function* () {
		const binding = yield* SandboxBinding;
		const sandboxId = "default";

		return Sandbox.of({
			createSession: (options?: SessionOptions) =>
				Effect.sync(() => {
					const sessionId = options?.id ?? crypto.randomUUID();
					return wrapSession(binding, sandboxId, `${sandboxId}-${sessionId}`);
				}),
			getSession: (id: string) => Effect.sync(() => wrapSession(binding, sandboxId, id)),
			deleteSession: () => Effect.void,
			destroy: () => Effect.void,
			setKeepAlive: () => Effect.void,
		});
	}),
);
