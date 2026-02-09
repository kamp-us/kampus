/** @internal */
import {Deferred, Effect, Queue, Ref, type Scope, Stream} from "effect";
import type {PtySpawnError} from "../Errors.ts";
import {Pty, type PtyProcess} from "../Pty.ts";
import {RingBuffer} from "../RingBuffer.ts";
import type {ClientHandle, MakeOptions, Session} from "../Session.ts";

const DEFAULT_BUFFER_CAPACITY = 100 * 1024; // 100KB

interface ClientEntry {
	readonly queue: Queue.Queue<string>;
	readonly cols: number;
	readonly rows: number;
}

/** @internal */
export const make = (
	options: MakeOptions,
): Effect.Effect<Session, PtySpawnError, Pty | Scope.Scope> =>
	Effect.gen(function* () {
		const pty = yield* Pty;
		const proc: PtyProcess = yield* pty.spawn({
			cols: options.cols,
			rows: options.rows,
		});

		const buffer = new RingBuffer(options.bufferCapacity ?? DEFAULT_BUFFER_CAPACITY);
		const clients = yield* Ref.make<Map<string, ClientEntry>>(new Map());
		const sessionExited = yield* Deferred.make<number>();

		// Recompute PTY size: min of all clients' dimensions
		const recomputeSize = Effect.gen(function* () {
			const map = yield* Ref.get(clients);
			if (map.size === 0) return;
			let minCols = Number.POSITIVE_INFINITY;
			let minRows = Number.POSITIVE_INFINITY;
			for (const entry of map.values()) {
				if (entry.cols < minCols) minCols = entry.cols;
				if (entry.rows < minRows) minRows = entry.rows;
			}
			yield* proc.resize(minCols, minRows);
		});

		// Distribution fiber: PTY output -> buffer + all client queues
		yield* proc.output.pipe(
			Stream.runForEach((data) =>
				Effect.gen(function* () {
					buffer.push(data);
					const map = yield* Ref.get(clients);
					yield* Effect.forEach(map.values(), (entry) => Queue.offer(entry.queue, data), {
						concurrency: "unbounded",
						discard: true,
					});
				}),
			),
			Effect.forkScoped,
		);

		// Exit watcher fiber: PTY exit -> resolve deferred + shutdown queues
		yield* proc.awaitExit.pipe(
			Effect.tap((code) => Deferred.succeed(sessionExited, code)),
			Effect.tap(() =>
				Effect.gen(function* () {
					const map = yield* Ref.get(clients);
					yield* Effect.forEach(map.values(), (entry) => Queue.shutdown(entry.queue), {
						concurrency: "unbounded",
						discard: true,
					});
				}),
			),
			Effect.forkScoped,
		);

		// attach
		const attach = (clientId: string, cols: number, rows: number): Effect.Effect<ClientHandle> =>
			Effect.gen(function* () {
				const queue = yield* Queue.unbounded<string>();

				// Replay scrollback
				for (const entry of buffer.snapshot()) {
					yield* Queue.offer(queue, entry);
				}

				// Register client
				yield* Ref.update(clients, (map) => {
					const next = new Map(map);
					next.set(clientId, {queue, cols, rows});
					return next;
				});
				yield* recomputeSize;

				const output = Stream.fromQueue(queue);

				const close = Effect.gen(function* () {
					yield* Queue.shutdown(queue);
					yield* Ref.update(clients, (map) => {
						const next = new Map(map);
						next.delete(clientId);
						return next;
					});
					yield* recomputeSize;
				});

				return {output, exited: sessionExited, close} satisfies ClientHandle;
			});

		// clientResize
		const clientResize = (clientId: string, cols: number, rows: number): Effect.Effect<void> =>
			Effect.gen(function* () {
				yield* Ref.update(clients, (map) => {
					const entry = map.get(clientId);
					if (!entry) return map;
					const next = new Map(map);
					next.set(clientId, {...entry, cols, rows});
					return next;
				});
				yield* recomputeSize;
			});

		return {
			id: options.id,
			clientCount: Ref.get(clients).pipe(Effect.map((map) => map.size)),
			exited: sessionExited,
			attach,
			write: (data) => proc.write(data),
			clientResize,
		} satisfies Session;
	});
