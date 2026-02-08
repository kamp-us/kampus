import {it} from "@effect/vitest";
import {Deferred, Effect, Layer, Queue, Stream} from "effect";
import {describe, expect} from "vitest";

import {Pty, type PtyProcess} from "../src/Pty.ts";
import {make as makeSession} from "../src/Session.ts";

// Test Pty layer: controllable mock
const makeMockPtyProcess = Effect.gen(function* () {
	const inputQueue = yield* Queue.unbounded<string>();
	const outputQueue = yield* Queue.unbounded<string>();
	const exitDeferred = yield* Deferred.make<number>();

	const process: PtyProcess = {
		output: Stream.fromQueue(outputQueue),
		awaitExit: Deferred.await(exitDeferred),
		write: (data) => Queue.offer(inputQueue, data),
		resize: () => Effect.void,
	};

	return {
		process,
		emitOutput: (data: string) => Queue.offer(outputQueue, data),
		triggerExit: (code: number) =>
			Effect.all([Deferred.succeed(exitDeferred, code), Queue.shutdown(outputQueue)]),
		getInput: Queue.take(inputQueue),
	};
});

const TestPty = Layer.succeed(Pty, {
	spawn: () =>
		Effect.gen(function* () {
			const mock = yield* makeMockPtyProcess;
			return mock.process;
		}),
});

describe("Session", () => {
	it.scoped("attach returns a ClientHandle with output stream", () =>
		Effect.gen(function* () {
			const session = yield* makeSession({id: "s1", cols: 80, rows: 24});
			const handle = yield* session.attach("c1", 80, 24);
			expect(handle.output).toBeDefined();
			expect(handle.close).toBeDefined();
			expect(handle.exited).toBeDefined();
		}).pipe(Effect.provide(TestPty)),
	);

	it.scoped("clientCount reflects attached clients", () =>
		Effect.gen(function* () {
			const session = yield* makeSession({id: "s1", cols: 80, rows: 24});
			expect(yield* session.clientCount).toBe(0);

			const h1 = yield* session.attach("c1", 80, 24);
			expect(yield* session.clientCount).toBe(1);

			const h2 = yield* session.attach("c2", 80, 24);
			expect(yield* session.clientCount).toBe(2);

			yield* h1.close;
			expect(yield* session.clientCount).toBe(1);

			yield* h2.close;
			expect(yield* session.clientCount).toBe(0);
		}).pipe(Effect.provide(TestPty)),
	);

	it.scoped("write forwards data to PTY", () =>
		Effect.gen(function* () {
			const session = yield* makeSession({id: "s1", cols: 80, rows: 24});
			yield* session.write("hello");
		}).pipe(Effect.provide(TestPty)),
	);
});
