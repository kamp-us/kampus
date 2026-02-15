import {it} from "@effect/vitest";
import {Chunk, Effect, Ref, Stream} from "effect";
import {describe, expect} from "vitest";

import {make as makeSession, restore} from "../src/Session.ts";
import {SessionCheckpoint} from "../src/SessionCheckpoint.ts";
import {makeControlledPtyLayer, type PtyControls, SimplePty} from "./_helpers.ts";

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

	describe("restore", () => {
		const makeCheckpoint = (overrides?: Partial<typeof SessionCheckpoint.Type>) =>
			new SessionCheckpoint({
				id: "restored-1",
				name: "my-session",
				cwd: "/home/user",
				createdAt: 1000,
				buffer: {entries: ["hello", " world"], totalBytes: 11, capacity: 100 * 1024},
				...overrides,
			});

		it.scoped("restored session starts in exited state", () =>
			Effect.gen(function* () {
				const session = yield* restore(makeCheckpoint());
				expect(yield* session.isExited).toBe(true);
			}).pipe(Effect.provide(SimplePty)),
		);

		it.scoped("restored session has metadata from checkpoint", () =>
			Effect.gen(function* () {
				const session = yield* restore(makeCheckpoint());
				const meta = yield* session.metadata;
				expect(meta.name).toBe("my-session");
				expect(meta.cwd).toBe("/home/user");
				expect(meta.createdAt).toBe(1000);
			}).pipe(Effect.provide(SimplePty)),
		);

		it.scoped("attach replays scrollback from checkpoint buffer", () =>
			Effect.gen(function* () {
				const session = yield* restore(makeCheckpoint());
				const handle = yield* session.attach("c1", 80, 24);

				// Read exactly 2 items (the scrollback entries)
				const chunks = yield* handle.output.pipe(Stream.take(2), Stream.runCollect);
				expect(Chunk.toArray(chunks)).toEqual(["hello", " world"]);
			}).pipe(Effect.provide(SimplePty)),
		);

		it.scoped("respawn starts new PTY after restore", () =>
			Effect.gen(function* () {
				const controlsRef = yield* Ref.make<PtyControls | null>(null);
				const ptyLayer = makeControlledPtyLayer(controlsRef);

				yield* Effect.gen(function* () {
					const session = yield* restore(makeCheckpoint());
					expect(yield* session.isExited).toBe(true);

					// Respawn creates a new PTY
					yield* session.respawn(80, 24);
					expect(yield* session.isExited).toBe(false);

					// Attach after respawn
					const handle = yield* session.attach("c1", 80, 24);

					// Controls should be available after respawn
					const controls = yield* Ref.get(controlsRef);
					expect(controls).not.toBeNull();

					// Emit output through the new PTY
					yield* controls!.emitOutput("new-data");

					// Scrollback (hello, world, restart banner) + new data
					// The restart banner is added by respawn, so we need to consume
					// scrollback entries first, then the new data
					const scrollback = yield* handle.output.pipe(
						Stream.take(4), // "hello", " world", restart banner, "new-data"
						Stream.runCollect,
					);
					const items = Chunk.toArray(scrollback);
					expect(items[0]).toBe("hello");
					expect(items[1]).toBe(" world");
					// items[2] is the restart banner
					expect(items[3]).toBe("new-data");
				}).pipe(Effect.provide(ptyLayer));
			}),
		);

		it.scoped("write to restored session before respawn is a no-op", () =>
			Effect.gen(function* () {
				const session = yield* restore(makeCheckpoint());
				// Should not throw — just silently ignored since procRef is null
				yield* session.write("ignored");
			}).pipe(Effect.provide(SimplePty)),
		);

		it.scoped("checkpoint round-trips through restore", () =>
			Effect.gen(function* () {
				const original = makeCheckpoint();
				const session = yield* restore(original);
				const roundTripped = yield* session.checkpoint;

				expect(roundTripped.id).toBe(original.id);
				expect(roundTripped.name).toBe(original.name);
				expect(roundTripped.cwd).toBe(original.cwd);
				expect(roundTripped.createdAt).toBe(original.createdAt);
				expect(roundTripped.buffer.entries).toEqual(original.buffer.entries);
				expect(roundTripped.buffer.totalBytes).toBe(original.buffer.totalBytes);
				expect(roundTripped.buffer.capacity).toBe(original.buffer.capacity);
			}).pipe(Effect.provide(SimplePty)),
		);
	});
});
