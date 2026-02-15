/** @internal */
import {Deferred, Effect, Queue, Ref, Scope, Stream} from "effect";
import type {PtySpawnError} from "../Errors.ts";
import {Pty, type PtyProcess} from "../Pty.ts";
import {RingBuffer} from "../RingBuffer.ts";
import type {ClientHandle, MakeOptions, Session, SessionMetadata} from "../Session.ts";
import {SessionCheckpoint} from "../SessionCheckpoint.ts";

const DEFAULT_BUFFER_CAPACITY = 100 * 1024; // 100KB

interface ClientEntry {
	readonly queue: Queue.Queue<string>;
	readonly cols: number;
	readonly rows: number;
}

type PtyService = Pty["Type"];

interface SessionParts {
	readonly id: string;
	readonly buffer: RingBuffer;
	readonly clients: Ref.Ref<Map<string, ClientEntry>>;
	readonly procRef: Ref.Ref<PtyProcess | null>;
	readonly exitedRef: Ref.Ref<Deferred.Deferred<number>>;
	readonly metadataRef: Ref.Ref<SessionMetadata>;
	readonly pty: PtyService;
	readonly sessionScope: Scope.Scope;
}

const makeRecomputeSize = (
	procRef: Ref.Ref<PtyProcess | null>,
	clients: Ref.Ref<Map<string, ClientEntry>>,
) =>
	Effect.gen(function* () {
		const proc = yield* Ref.get(procRef);
		if (!proc) return;
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

const spawnGeneration = (
	parts: SessionParts,
	cols: number,
	rows: number,
): Effect.Effect<void, PtySpawnError> =>
	Effect.gen(function* () {
		const {buffer, clients, procRef, exitedRef, pty, sessionScope} = parts;

		const proc = yield* pty
			.spawn({cols, rows})
			.pipe(Effect.provideService(Scope.Scope, sessionScope));

		const generationExited = yield* Deferred.make<number>();
		yield* Ref.set(procRef, proc);
		yield* Ref.set(exitedRef, generationExited);

		// Distribution fiber: PTY output -> buffer + all client queues
		yield* proc.output.pipe(
			Stream.runForEach((data: string) =>
				Effect.gen(function* () {
					buffer.push(data);
					const map = yield* Ref.get(clients);
					yield* Effect.forEach(
						map.values(),
						(entry: ClientEntry) => Queue.offer(entry.queue, data),
						{concurrency: "unbounded", discard: true},
					);
				}),
			),
			Effect.forkIn(sessionScope),
		);

		// Exit watcher: resolve deferred, clear proc, shutdown queues
		yield* proc.awaitExit.pipe(
			Effect.tap((code: number) => Deferred.succeed(generationExited, code)),
			Effect.tap(() => Ref.set(procRef, null)),
			Effect.tap(() =>
				Effect.gen(function* () {
					const map = yield* Ref.get(clients);
					yield* Effect.forEach(
						map.values(),
						(entry: ClientEntry) => Queue.shutdown(entry.queue),
						{concurrency: "unbounded", discard: true},
					);
				}),
			),
			Effect.forkIn(sessionScope),
		);
	});

const buildSession = (parts: SessionParts): Effect.Effect<Session> =>
	Effect.gen(function* () {
		const {id, buffer, clients, procRef, exitedRef, metadataRef} = parts;

		const recomputeSize = makeRecomputeSize(procRef, clients);

		const attach = (
			clientId: string,
			cols: number,
			rows: number,
		): Effect.Effect<ClientHandle> =>
			Effect.gen(function* () {
				const queue = yield* Queue.unbounded<string>();

				for (const entry of buffer.snapshot()) {
					yield* Queue.offer(queue, entry);
				}

				yield* Ref.update(clients, (map) => {
					const next = new Map(map);
					next.set(clientId, {queue, cols, rows});
					return next;
				});
				yield* recomputeSize;

				const output = Stream.fromQueue(queue);
				const currentExited = yield* Ref.get(exitedRef);

				const close = Effect.gen(function* () {
					yield* Queue.shutdown(queue);
					yield* Ref.update(clients, (map) => {
						const next = new Map(map);
						next.delete(clientId);
						return next;
					});
					yield* recomputeSize;
				});

				return {output, exited: currentExited, close} satisfies ClientHandle;
			});

		const clientResize = (
			clientId: string,
			cols: number,
			rows: number,
		): Effect.Effect<void> =>
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

		const initialExited = yield* Ref.get(exitedRef);

		return {
			id,
			clientCount: Ref.get(clients).pipe(Effect.map((map) => map.size)),
			exited: initialExited,
			isExited: Ref.get(procRef).pipe(Effect.map((p) => p === null)),
			metadata: Ref.get(metadataRef),
			setName: (name) => Ref.update(metadataRef, (m) => ({...m, name})),
			attach,
			write: (data) =>
				Effect.gen(function* () {
					const proc = yield* Ref.get(procRef);
					if (proc) yield* proc.write(data);
				}),
			clientResize,
			respawn: (cols, rows) =>
				Effect.gen(function* () {
					buffer.push("\r\n\x1b[33m--- shell restarted ---\x1b[0m\r\n");
					yield* spawnGeneration(parts, cols, rows);
				}),
			checkpoint: Effect.gen(function* () {
				const meta = yield* Ref.get(metadataRef);
				return new SessionCheckpoint({
					id,
					name: meta.name,
					cwd: meta.cwd,
					createdAt: meta.createdAt,
					buffer: buffer.serialize(),
				});
			}),
		} satisfies Session;
	});

/** @internal */
export const make = (
	options: MakeOptions,
): Effect.Effect<Session, PtySpawnError, Pty | Scope.Scope> =>
	Effect.gen(function* () {
		const pty = yield* Pty;
		const sessionScope = yield* Effect.scope;

		const buffer = new RingBuffer(options.bufferCapacity ?? DEFAULT_BUFFER_CAPACITY);
		const clients = yield* Ref.make<Map<string, ClientEntry>>(new Map());
		const procRef = yield* Ref.make<PtyProcess | null>(null);
		const exitedRef = yield* Ref.make(yield* Deferred.make<number>());
		const metadataRef = yield* Ref.make<SessionMetadata>({
			name: null,
			cwd: null,
			createdAt: Date.now(),
		});

		const parts: SessionParts = {
			id: options.id,
			buffer,
			clients,
			procRef,
			exitedRef,
			metadataRef,
			pty,
			sessionScope,
		};

		// Spawn initial PTY (no restart banner)
		yield* spawnGeneration(parts, options.cols, options.rows);

		return yield* buildSession(parts);
	});

/** @internal */
export const restore = (
	checkpoint: SessionCheckpoint,
): Effect.Effect<Session, never, Pty | Scope.Scope> =>
	Effect.gen(function* () {
		const pty = yield* Pty;
		const sessionScope = yield* Effect.scope;

		const buffer = RingBuffer.fromSnapshot({
			entries: checkpoint.buffer.entries.slice(),
			totalBytes: checkpoint.buffer.totalBytes,
			capacity: checkpoint.buffer.capacity,
		});
		const clients = yield* Ref.make<Map<string, ClientEntry>>(new Map());
		const procRef = yield* Ref.make<PtyProcess | null>(null);

		// Create already-resolved deferred to mark session as exited
		const exitDeferred = yield* Deferred.make<number>();
		yield* Deferred.succeed(exitDeferred, 0);
		const exitedRef = yield* Ref.make(exitDeferred);

		const metadataRef = yield* Ref.make<SessionMetadata>({
			name: checkpoint.name,
			cwd: checkpoint.cwd,
			createdAt: checkpoint.createdAt,
		});

		return yield* buildSession({
			id: checkpoint.id,
			buffer,
			clients,
			procRef,
			exitedRef,
			metadataRef,
			pty,
			sessionScope,
		});
	});
