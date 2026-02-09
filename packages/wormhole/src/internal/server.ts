/** @internal */
import * as Socket from "@effect/platform/Socket";
import {Deferred, Effect, Option, Queue, Ref, Stream} from "effect";
import {parseMessage, SessionListResponse, SessionMessage} from "../Protocol.ts";
import type {ClientHandle, Session} from "../Session.ts";
import {SessionStore} from "../SessionStore.ts";

/** @internal */
export const handleConnection = (socket: Socket.Socket) =>
	Effect.scoped(
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const write = yield* socket.writer;
			const clientId = crypto.randomUUID();
			const decoder = new TextDecoder();

			const sessionRef = yield* Ref.make<Option.Option<Session>>(Option.none());
			const handleRef = yield* Ref.make<Option.Option<ClientHandle>>(Option.none());
			const handleMailbox = yield* Queue.unbounded<ClientHandle>();

			const sendJson = (msg: object) => write(JSON.stringify(msg));

			const doAttach = (sessionId: string | null, cols: number, rows: number) =>
				Effect.gen(function* () {
					// Close previous handle to avoid leaking client queues
					const prev = yield* Ref.get(handleRef);
					if (Option.isSome(prev)) yield* prev.value.close;

					let targetSession = Option.getOrUndefined(yield* Ref.get(sessionRef));

					if (sessionId) {
						const existing = yield* store.get(sessionId);
						if (existing) targetSession = existing;
					}

					if (!targetSession) {
						const id = sessionId ?? crypto.randomUUID();
						const created = yield* store.create(id, cols, rows).pipe(
							Effect.catchTag("PtySpawnError", (e) =>
								Effect.gen(function* () {
									yield* write(new Socket.CloseEvent(4002, `Failed to spawn PTY: ${e.shell}`));
									return undefined as Session | undefined;
								}),
							),
						);
						if (!created) return;
						targetSession = created;
					}

					yield* Ref.set(sessionRef, Option.some(targetSession));
					const newHandle = yield* targetSession.attach(clientId, cols, rows);
					yield* Ref.set(handleRef, Option.some(newHandle));
					yield* sendJson(new SessionMessage({type: "session", sessionId: targetSession.id}));
					yield* Queue.offer(handleMailbox, newHandle);
				});

			// Fiber A: forward PTY output to WebSocket, looping on session switches
			const forwardOutput: Effect.Effect<void, Socket.SocketError> = Effect.gen(function* () {
				const h = yield* Queue.take(handleMailbox);
				yield* h.output.pipe(Stream.runForEach((data) => write(data)));
				// Output stream ended — either handle was closed (session switch) or PTY exited
				if (yield* Deferred.isDone(h.exited)) {
					const code = yield* Deferred.await(h.exited);
					yield* write(`\r\n\x1b[33mShell exited (code: ${code})\x1b[0m\r\n`);
					yield* write(new Socket.CloseEvent(1000));
					return;
				}
				// Session switch — wait for next handle
				yield* Effect.suspend(() => forwardOutput);
			});

			yield* Effect.ensuring(
				Effect.raceFirst(
					forwardOutput,

					// Fiber B: WebSocket input → PTY + control messages
					socket.runRaw((data) => {
						const msg = typeof data === "string" ? data : decoder.decode(data as Uint8Array);

						return Effect.gen(function* () {
							const currentHandle = Option.getOrUndefined(yield* Ref.get(handleRef));
							const currentSession = Option.getOrUndefined(yield* Ref.get(sessionRef));

							if (!currentHandle) {
								const parsed = parseMessage(msg);
								if (Option.isNone(parsed) || parsed.value.type !== "attach") {
									yield* write(new Socket.CloseEvent(4001, "First message must be attach"));
									return;
								}
								yield* doAttach(parsed.value.sessionId, parsed.value.cols, parsed.value.rows);
								return;
							}

							if (!currentSession) return;

							const parsed = parseMessage(msg);
							if (Option.isNone(parsed)) {
								yield* currentSession.write(msg);
								return;
							}

							const control = parsed.value;
							switch (control.type) {
								case "resize":
									yield* currentSession.clientResize(clientId, control.cols, control.rows);
									return;
								case "session_list_request": {
									const sessions = yield* store.list();
									yield* sendJson(new SessionListResponse({type: "session_list", sessions}));
									return;
								}
								case "session_new":
									yield* doAttach(null, control.cols, control.rows);
									return;
								default:
									return;
							}
						});
					}),
				),
				// Cleanup: close current client handle
				Effect.gen(function* () {
					const h = yield* Ref.get(handleRef);
					if (Option.isSome(h)) yield* h.value.close;
				}),
			);
		}),
	);
