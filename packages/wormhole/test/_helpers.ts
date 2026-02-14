/**
 * Shared test helpers for @kampus/wormhole.
 *
 * Three mock PTY variants, from simplest to most controllable:
 *
 *   StubPty      – static no-op process (shape-checking only)
 *   SimplePty    – independent spawns, no external controls
 *   MockPty      – exposes PtyControls via Ref for driving tests
 */
import {Deferred, Effect, Layer, Queue, Ref, Stream} from "effect";
import {Pty, type PtyProcess} from "../src/Pty.ts";
import {SessionStore} from "../src/SessionStore.ts";

// ── PtyControls (for tests that need to drive PTY I/O) ──────────

export interface PtyControls {
	readonly emitOutput: (data: string) => Effect.Effect<boolean>;
	readonly triggerExit: (code: number) => Effect.Effect<void>;
	readonly getInput: Effect.Effect<string>;
}

// ── StubPty: static no-op process ───────────────────────────────

const stubProcess: PtyProcess = {
	output: Stream.empty,
	awaitExit: Effect.succeed(0),
	write: () => Effect.void,
	resize: () => Effect.void,
};

export const StubPty = Layer.succeed(Pty, {
	spawn: () => Effect.succeed(stubProcess),
});

// ── SimplePty: independent spawns, no external controls ─────────

export const SimplePty = Layer.succeed(Pty, {
	spawn: () =>
		Effect.gen(function* () {
			const outputQueue = yield* Queue.unbounded<string>();
			const exitDeferred = yield* Deferred.make<number>();
			return {
				output: Stream.fromQueue(outputQueue),
				awaitExit: Deferred.await(exitDeferred),
				write: () => Effect.void,
				resize: () => Effect.void,
			} satisfies PtyProcess;
		}),
});

// ── MockPty: controllable via PtyControls Ref ───────────────────

export function makeControlledPtyLayer(controlsRef: Ref.Ref<PtyControls | null>): Layer.Layer<Pty> {
	return Layer.succeed(Pty, {
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
}

// ── Composite layers ────────────────────────────────────────────

export const SimpleSessionStore = SessionStore.Default.pipe(Layer.provide(SimplePty));

export function makeControlledSessionStore(controlsRef: Ref.Ref<PtyControls | null>) {
	return SessionStore.Default.pipe(Layer.provide(makeControlledPtyLayer(controlsRef)));
}
