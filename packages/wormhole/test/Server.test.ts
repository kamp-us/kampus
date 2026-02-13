import * as Socket from "@effect/platform/Socket";
import {it} from "@effect/vitest";
import {Deferred, Effect, Fiber, Layer, Queue, Ref, Stream} from "effect";
import {describe, expect} from "vitest";
import {handleMuxConnection} from "../src/internal/muxServer.ts";
import {handleConnection} from "../src/internal/server.ts";
import {CONTROL_CHANNEL, encodeBinaryFrame, parseBinaryFrame} from "../src/Protocol.ts";
import {Pty, type PtyProcess} from "../src/Pty.ts";
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
						Effect.all([Deferred.succeed(exitDeferred, code), Queue.shutdown(outputQueue)]).pipe(
							Effect.asVoid,
						),
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

// ── Binary Mock Socket (for mux tests) ──────────────────────────────

const makeMuxMockSocket = Effect.gen(function* () {
	const incoming = yield* Queue.unbounded<Uint8Array>();
	const outgoing = yield* Queue.unbounded<Uint8Array | Socket.CloseEvent>();

	const writeFn = (data: string | Uint8Array | Socket.CloseEvent) => {
		if (data instanceof Socket.CloseEvent) {
			return Queue.offer(outgoing, data as any).pipe(
				Effect.tap(() => Queue.shutdown(incoming)),
				Effect.asVoid,
			);
		}
		const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
		return Queue.offer(outgoing, bytes).pipe(Effect.asVoid);
	};

	return {
		socket: {
			writer: Effect.succeed(writeFn),
			runRaw: (handler: (data: string | Uint8Array) => Effect.Effect<void, any, any>) =>
				Stream.fromQueue(incoming).pipe(Stream.runForEach(handler)),
		} as unknown as Socket.Socket,
		sendControl: (msg: object) => {
			const json = JSON.stringify(msg);
			const frame = encodeBinaryFrame(CONTROL_CHANNEL, new TextEncoder().encode(json));
			return Queue.offer(incoming, frame);
		},
		sendData: (channel: number, data: string) => {
			const frame = encodeBinaryFrame(channel, new TextEncoder().encode(data));
			return Queue.offer(incoming, frame);
		},
		receiveControl: Effect.gen(function* () {
			const frame = yield* Queue.take(outgoing);
			if (frame instanceof Socket.CloseEvent) return frame as any;
			const bytes = frame as Uint8Array;
			const {channel, payload} = parseBinaryFrame(bytes);
			expect(channel).toBe(CONTROL_CHANNEL);
			return JSON.parse(new TextDecoder().decode(payload));
		}),
		receiveData: Effect.gen(function* () {
			const frame = yield* Queue.take(outgoing);
			const bytes = frame as Uint8Array;
			return parseBinaryFrame(bytes);
		}),
		close: Queue.shutdown(incoming),
	};
});

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

// ── Mux Server Tests ────────────────────────────────────────────────

describe("Mux server handler", () => {
	it.effect("session_create creates session and responds with channel", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const response = yield* receiveControl;
			expect(response.type).toBe("session_created");
			expect(response.channel).toBe(0);
			expect(typeof response.sessionId).toBe("string");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("PTY output arrives on assigned channel as binary", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, receiveData, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;

			const controls = yield* Ref.get(controlsRef);
			yield* controls!.emitOutput("hello world");

			const data = yield* receiveData;
			expect(data.channel).toBe(created.channel);
			expect(new TextDecoder().decode(data.payload)).toBe("hello world");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("binary input routed to correct session", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, sendData, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;

			const controls = yield* Ref.get(controlsRef);
			yield* sendData(created.channel, "ls -la");
			const input = yield* controls!.getInput;
			expect(input).toBe("ls -la");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("session_exit sent when PTY exits", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			yield* receiveControl; // consume session_created

			const controls = yield* Ref.get(controlsRef);
			yield* controls!.triggerExit(0);

			const exit = yield* receiveControl;
			expect(exit.type).toBe("session_exit");
			expect(exit.exitCode).toBe(0);

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("session_list_request lists active sessions", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			yield* receiveControl; // consume session_created

			yield* sendControl({type: "session_list_request"});
			const list = yield* receiveControl;
			expect(list.type).toBe("session_list");
			expect(list.sessions.length).toBe(1);

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("session persists in store after PTY exit", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;

			const controls = yield* Ref.get(controlsRef);
			yield* controls!.triggerExit(0);
			yield* receiveControl; // consume session_exit

			// Session should still be attachable (not deleted from store)
			yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
			const reattached = yield* receiveControl;
			expect(reattached.type).toBe("session_created");
			expect(reattached.sessionId).toBe(created.sessionId);

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("reattach to exited session respawns PTY with working I/O", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, sendData, receiveControl, receiveData, close} =
				yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			// Create and kill session
			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;
			const oldControls = yield* Ref.get(controlsRef);
			yield* oldControls!.triggerExit(0);
			yield* receiveControl; // consume session_exit

			// Reattach — triggers respawn
			yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
			const reattached = yield* receiveControl;
			const channel = reattached.channel;

			// New PTY should work — controlsRef now points to the new generation
			const newControls = yield* Ref.get(controlsRef);
			expect(newControls).not.toBe(oldControls); // new generation

			yield* newControls!.emitOutput("new shell output");

			// Drain any replay frames before seeing new output
			let found = false;
			for (let i = 0; i < 10; i++) {
				const data = yield* receiveData;
				const text = new TextDecoder().decode(data.payload);
				if (text === "new shell output") {
					expect(data.channel).toBe(channel);
					found = true;
					break;
				}
			}
			expect(found).toBe(true);

			// Input should route to new PTY
			yield* sendData(channel, "echo hello");
			const input = yield* newControls!.getInput;
			expect(input).toBe("echo hello");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("scrollback including restart separator replayed on reattach", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, receiveData, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;

			const controls = yield* Ref.get(controlsRef);
			yield* controls!.emitOutput("original output");
			yield* receiveData; // drain

			yield* controls!.triggerExit(0);
			yield* receiveControl; // consume session_exit

			yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
			yield* receiveControl; // consume session_created

			// Replay: first frame = original output, second = restart separator
			const replay1 = yield* receiveData;
			expect(new TextDecoder().decode(replay1.payload)).toBe("original output");

			const replay2 = yield* receiveData;
			expect(new TextDecoder().decode(replay2.payload)).toContain("shell restarted");

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);

	it.effect("session_destroy removes session from store", () =>
		Effect.gen(function* () {
			const controlsRef = yield* Ref.make<PtyControls | null>(null);
			const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

			const fiber = yield* handleMuxConnection(socket).pipe(
				Effect.provide(makeTestLayers(controlsRef)),
				Effect.fork,
			);

			yield* sendControl({type: "session_create", cols: 80, rows: 24});
			const created = yield* receiveControl;

			// Destroy session
			yield* sendControl({type: "session_destroy", sessionId: created.sessionId});

			// Verify via session_list — should be empty
			yield* sendControl({type: "session_list_request"});
			const list = yield* receiveControl;
			expect(list.type).toBe("session_list");
			expect(list.sessions.length).toBe(0);

			yield* close;
			yield* Fiber.join(fiber);
		}),
	);
});
