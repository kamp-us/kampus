import {describe, expect} from "vitest";
import {it} from "@effect/vitest";
import {Chunk, Effect, Stream} from "effect";

import {Pty} from "../src/Pty.ts";
import {PtyLive} from "../src/internal/pty.ts";

describe("PtyLive (integration)", () => {
	it.scoped(
		"spawn + read output",
		() =>
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({
					shell: "/bin/sh",
					args: ["-c", "echo hello-from-pty"],
					cols: 80,
					rows: 24,
				});

				const first = yield* proc.output.pipe(Stream.take(1), Stream.runCollect);
				const output = Chunk.toArray(first).join("");
				expect(output).toContain("hello-from-pty");
			}).pipe(Effect.provide(PtyLive)),
		{timeout: 5000},
	);

	it.scoped(
		"awaitExit resolves with exit code",
		() =>
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({
					shell: "/bin/sh",
					args: ["-c", "exit 42"],
					cols: 80,
					rows: 24,
				});
				const code = yield* proc.awaitExit;
				expect(code).toBe(42);
			}).pipe(Effect.provide(PtyLive)),
		{timeout: 5000},
	);

	it.scoped(
		"write sends data to PTY stdin",
		() =>
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({
					shell: "/bin/cat",
					cols: 80,
					rows: 24,
				});

				yield* proc.write("test-input\n");
				const first = yield* proc.output.pipe(Stream.take(1), Stream.runCollect);
				const output = Chunk.toArray(first).join("");
				expect(output).toContain("test-input");
			}).pipe(Effect.provide(PtyLive)),
		{timeout: 5000},
	);

	it.scoped(
		"resize does not error",
		() =>
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({
					shell: "/bin/sh",
					args: ["-c", "sleep 1"],
					cols: 80,
					rows: 24,
				});
				yield* proc.resize(120, 40);
			}).pipe(Effect.provide(PtyLive)),
		{timeout: 5000},
	);

	it.scoped(
		"write after exit is a no-op (Deferred guard)",
		() =>
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({
					shell: "/bin/sh",
					args: ["-c", "exit 0"],
					cols: 80,
					rows: 24,
				});
				yield* proc.awaitExit;
				yield* proc.write("ignored");
				yield* proc.resize(100, 50);
			}).pipe(Effect.provide(PtyLive)),
		{timeout: 5000},
	);
});
