import {it} from "@effect/vitest";
import {Deferred, Effect, Layer, Queue, Stream} from "effect";
import {describe, expect} from "vitest";

import {Pty, type PtyProcess} from "../src/Pty.ts";
import {SessionStore} from "../src/SessionStore.ts";

// Test Pty: each spawn gets independent mock
const makeTestPtyProcess = Effect.gen(function* () {
	const outputQueue = yield* Queue.unbounded<string>();
	const exitDeferred = yield* Deferred.make<number>();
	return {
		output: Stream.fromQueue(outputQueue),
		awaitExit: Deferred.await(exitDeferred),
		write: () => Effect.void,
		resize: () => Effect.void,
	} satisfies PtyProcess;
});

const TestPty = Layer.succeed(Pty, {
	spawn: () => makeTestPtyProcess,
});

const TestSessionStore = SessionStore.Default.pipe(Layer.provide(TestPty));

describe("SessionStore", () => {
	it.effect("create + get returns session", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const session = yield* store.create("s1", 80, 24);
			expect(session.id).toBe("s1");

			const found = yield* store.get("s1");
			expect(found?.id).toBe("s1");
		}).pipe(Effect.provide(TestSessionStore)),
	);

	it.effect("get returns undefined for unknown id", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const found = yield* store.get("nonexistent");
			expect(found).toBeUndefined();
		}).pipe(Effect.provide(TestSessionStore)),
	);

	it.effect("getOrFail returns SessionNotFoundError for unknown id", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const result = yield* store
				.getOrFail("nonexistent")
				.pipe(Effect.catchTag("SessionNotFoundError", (e) => Effect.succeed(e.sessionId)));
			expect(result).toBe("nonexistent");
		}).pipe(Effect.provide(TestSessionStore)),
	);

	it.effect("list shows created sessions", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			yield* store.create("s1", 80, 24);
			yield* store.create("s2", 120, 40);
			const sessions = yield* store.list();
			expect(sessions).toHaveLength(2);
			expect(sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
		}).pipe(Effect.provide(TestSessionStore)),
	);

	it.effect("size reflects session count", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			expect(yield* store.size).toBe(0);
			yield* store.create("s1", 80, 24);
			expect(yield* store.size).toBe(1);
		}).pipe(Effect.provide(TestSessionStore)),
	);
});
