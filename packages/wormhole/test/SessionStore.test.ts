import {it} from "@effect/vitest";
import {Effect} from "effect";
import {describe, expect} from "vitest";

import {SessionStore} from "../src/SessionStore.ts";
import {SimpleSessionStore} from "./_helpers.ts";

describe("SessionStore", () => {
	it.effect("create + get returns session", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const session = yield* store.create("s1", 80, 24);
			expect(session.id).toBe("s1");

			const found = yield* store.get("s1");
			expect(found?.id).toBe("s1");
		}).pipe(Effect.provide(SimpleSessionStore)),
	);

	it.effect("get returns undefined for unknown id", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const found = yield* store.get("nonexistent");
			expect(found).toBeUndefined();
		}).pipe(Effect.provide(SimpleSessionStore)),
	);

	it.effect("getOrFail returns SessionNotFoundError for unknown id", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const result = yield* store
				.getOrFail("nonexistent")
				.pipe(Effect.catchTag("SessionNotFoundError", (e) => Effect.succeed(e.sessionId)));
			expect(result).toBe("nonexistent");
		}).pipe(Effect.provide(SimpleSessionStore)),
	);

	it.effect("list shows created sessions", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			yield* store.create("s1", 80, 24);
			yield* store.create("s2", 120, 40);
			const sessions = yield* store.list();
			expect(sessions).toHaveLength(2);
			expect(sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
		}).pipe(Effect.provide(SimpleSessionStore)),
	);

	it.effect("size reflects session count", () =>
		Effect.gen(function* () {
			const store = yield* SessionStore;
			expect(yield* store.size).toBe(0);
			yield* store.create("s1", 80, 24);
			expect(yield* store.size).toBe(1);
		}).pipe(Effect.provide(SimpleSessionStore)),
	);
});
