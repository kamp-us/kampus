import {it} from "@effect/vitest";
import {Effect} from "effect";
import {describe, expect} from "vitest";

import {Pty} from "../src/Pty.ts";
import {StubPty} from "./_helpers.ts";

describe("Pty (service interface)", () => {
	it.effect("can yield Pty service from context", () =>
		Effect.gen(function* () {
			const pty = yield* Pty;
			expect(pty.spawn).toBeDefined();
		}).pipe(Effect.provide(StubPty)),
	);

	it.scoped("spawn returns a PtyProcess with expected shape", () =>
		Effect.gen(function* () {
			const pty = yield* Pty;
			const proc = yield* pty.spawn({cols: 80, rows: 24});
			expect(proc.output).toBeDefined();
			expect(proc.write).toBeTypeOf("function");
			expect(proc.resize).toBeTypeOf("function");
			expect(proc.awaitExit).toBeDefined();
		}).pipe(Effect.provide(StubPty)),
	);
});
