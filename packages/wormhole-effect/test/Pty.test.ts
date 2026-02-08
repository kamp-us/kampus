import {describe, expect} from "vitest";
import {it} from "@effect/vitest";
import {Effect, Layer, Stream} from "effect";

import {Pty} from "../src/Pty.ts";
import type {PtyProcess} from "../src/Pty.ts";

const stubProcess: PtyProcess = {
	output: Stream.empty,
	awaitExit: Effect.succeed(0),
	write: () => Effect.void,
	resize: () => Effect.void,
};

const TestPty = Layer.succeed(Pty, {
	spawn: () => Effect.succeed(stubProcess),
});

describe("Pty (service interface)", () => {
	it.effect("can yield Pty service from context", () =>
		Effect.gen(function* () {
			const pty = yield* Pty;
			expect(pty.spawn).toBeDefined();
		}).pipe(Effect.provide(TestPty)),
	);

	it.effect("spawn returns a PtyProcess with expected shape", () =>
		Effect.gen(function* () {
			const pty = yield* Pty;
			const proc = yield* pty.spawn({cols: 80, rows: 24});
			expect(proc.output).toBeDefined();
			expect(proc.write).toBeTypeOf("function");
			expect(proc.resize).toBeTypeOf("function");
			expect(proc.awaitExit).toBeDefined();
		}).pipe(Effect.provide(TestPty)),
	);
});
