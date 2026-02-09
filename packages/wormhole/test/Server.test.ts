import {it} from "@effect/vitest";
import * as Socket from "@effect/platform/Socket";
import {Deferred, Effect, Fiber, Layer, Queue, Ref, Stream} from "effect";
import {describe, expect} from "vitest";

import {Pty, type PtyProcess} from "../src/Pty.ts";
import {handleConnection} from "../src/internal/server.ts";
import {SessionStore} from "../src/SessionStore.ts";

// ── Mock Socket ──────────────────────────────────────────────────────

const makeMockSocket = Effect.gen(function* () {
	const incoming = yield* Queue.unbounded<string>();
	const outgoing = yield* Queue.unbounded<string | Socket.CloseEvent>();

	const writeFn = (data: string | Uint8Array | Socket.CloseEvent) => {
		if (data instanceof Socket.CloseEvent) {
			return Queue.offer(outgoing, data).pipe(
				Effect.tap(() => Queue.shutdown(incoming)),
				Effect.asVoid,
			);
		}
		const str = typeof data === "string" ? data : new TextDecoder().decode(data as Uint8Array);
		return Queue.offer(outgoing, str).pipe(Effect.asVoid);
	};

	return {
		socket: {
			writer: Effect.succeed(writeFn),
			runRaw: (handler: (data: string | Uint8Array) => Effect.Effect<void, any, any>) =>
				Stream.fromQueue(incoming).pipe(Stream.runForEach(handler)),
		} as unknown as Socket.Socket,
		send: (msg: string) => Queue.offer(incoming, msg),
		receive: Queue.take(outgoing),
		close: Queue.shutdown(incoming),
	};
});

// ── Mock PTY ─────────────────────────────────────────────────────────

interface PtyControls {
	emitOutput: (data: string) => Effect.Effect<boolean>;
	triggerExit: (code: number) => Effect.Effect<void>;
	getInput: Effect.Effect<string>;
}

const makeTestLayers = (controlsRef: Ref.Ref<PtyControls | null>) => {
	const testPty = Layer.succeed(Pty, {
		spawn: () =>
			Effect.gen(function* () {
				const inputQueue = yield* Queue.unbounded<string>();
				const outputQueue = yield* Queue.unbounded<string>();
				const exitDeferred = yield* Deferred.make<number>();

				yield* Ref.set(controlsRef, {
					emitOutput: (data) => Queue.offer(outputQueue, data),
					triggerExit: (code) =>
						Effect.all([
							Deferred.succeed(exitDeferred, code),
							Queue.shutdown(outputQueue),
						]).pipe(Effect.asVoid),
					getInput: Queue.take(inputQueue),
				});

				return {
					output: Stream.fromQueue(outputQueue),
					awaitExit: Deferred.await(exitDeferred),
					write: (data) => Queue.offer(inputQueue, data).pipe(Effect.asVoid),
					resize: () => Effect.void,
				} satisfies PtyProcess;
			}),
	});

	return SessionStore.Default.pipe(Layer.provide(testPty));
};

const attachMsg = (sessionId: string | null = null, cols = 80, rows = 24) =>
	JSON.stringify({type: "attach", sessionId, cols, rows});

// ── Tests ────────────────────────────────────────────────────────────

describe("Server handler", () => {
	it.effect("rejects non-attach first message with code 4001", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, send, receive} = yield* makeMockSocket;

			const fiber = yield* handleConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* send("hello world");
			const response = yield* receive;

			expect(response).toBeInstanceOf(Socket.CloseEvent);
			expect((response as Socket.CloseEvent).code).toBe(4001);

			yield* Fiber.join(fiber);
		}),
	);

	it.effect("attach creates session and responds with session message", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, send, receive, close} = yield* makeMockSocket;

			const fiber = yield* handleConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* send(attachMsg("test-session"));
			const response = yield* receive;

			const parsed = JSON.parse(response as string);
			expect(parsed.type).toBe("session");
			expect(parsed.sessionId).toBe("test-session");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("forwards raw text to PTY after attach", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, send, receive, close} = yield* makeMockSocket;

			const fiber = yield* handleConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* send(attachMsg());
			yield* receive; // consume session response

			// PTY controls are now available (spawn happened during attach)
			const controls = yield* Ref.get(controlsRef);
			expect(controls).not.toBeNull();

			yield* send("ls -la");
			const input = yield* controls!.getInput;
			expect(input).toBe("ls -la");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("forwards resize messages to session", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, send, receive, close} = yield* makeMockSocket;

			const fiber = yield* handleConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* send(attachMsg());
			yield* receive; // consume session response

			// Send resize — should not crash
			yield* send(JSON.stringify({type: "resize", cols: 120, rows: 40}));

			// Verify handler is still alive by sending raw text
			const controls = yield* Ref.get(controlsRef);
			yield* send("echo test");
			const input = yield* controls!.getInput;
			expect(input).toBe("echo test");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("forwards PTY output to socket", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, send, receive, close} = yield* makeMockSocket;

			const fiber = yield* handleConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* send(attachMsg());
			yield* receive; // consume session response

			const controls = yield* Ref.get(controlsRef);
			yield* controls!.emitOutput("drwxr-xr-x 5 user staff 160 Jan 1 00:00 .\n");
			const output = yield* receive;
			expect(output).toBe("drwxr-xr-x 5 user staff 160 Jan 1 00:00 .\n");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);
});
