import {it} from "@effect/vitest";
import {Effect} from "effect";
import {describe, expect} from "vitest";

import {make as makeSession} from "../src/Session.ts";
import {SimplePty} from "./_helpers.ts";

describe("Session", () => {
	it.scoped("attach returns a ClientHandle with output stream", () =>
		Effect.gen(function* () {
			const session = yield* makeSession({id: "s1", cols: 80, rows: 24});
			const handle = yield* session.attach("c1", 80, 24);
			expect(handle.output).toBeDefined();
			expect(handle.close).toBeDefined();
			expect(handle.exited).toBeDefined();
		}).pipe(Effect.provide(SimplePty)),
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
		}).pipe(Effect.provide(SimplePty)),
	);

	it.scoped("write forwards data to PTY", () =>
		Effect.gen(function* () {
			const session = yield* makeSession({id: "s1", cols: 80, rows: 24});
			yield* session.write("hello");
		}).pipe(Effect.provide(SimplePty)),
	);
});
