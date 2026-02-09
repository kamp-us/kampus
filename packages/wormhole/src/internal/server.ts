/** @internal */
import * as Socket from "@effect/platform/Socket";
import {Deferred, Effect, Option, Stream} from "effect";
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

			let session: Session | undefined;
			let handle: ClientHandle | undefined;
			const handleReady = yield* Deferred.make<ClientHandle>();

			const sendJson = (msg: object) => write(JSON.stringify(msg));

			const doAttach = (sessionId: string | null, cols: number, rows: number) =>
				Effect.gen(function* () {
					if (sessionId) {
						const existing = yield* store.get(sessionId);
						if (existing) session = existing;
					}

					if (!session) {
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
						session = created;
					}

					handle = yield* session.attach(clientId, cols, rows);
					yield* sendJson(new SessionMessage({type: "session", sessionId: session.id}));
					yield* Deferred.succeed(handleReady, handle);
				});

			yield* Effect.ensuring(
				Effect.raceFirst(
					// Fiber A: PTY output → WebSocket
					Deferred.await(handleReady).pipe(
						Effect.flatMap((h) =>
							h.output.pipe(
								Stream.runForEach((data) => write(data)),
								Effect.andThen(
									Deferred.await(h.exited).pipe(
										Effect.flatMap((code) => {
											const msg = `\r\n\x1b[33mShell exited (code: ${code})\x1b[0m\r\n`;
											return write(msg);
										}),
										Effect.andThen(write(new Socket.CloseEvent(1000))),
									),
								),
							),
						),
					),

					// Fiber B: WebSocket input → PTY + control messages
					socket.runRaw((data) => {
						const msg = typeof data === "string" ? data : decoder.decode(data as Uint8Array);

						if (!handle) {
							const parsed = parseMessage(msg);
							if (Option.isNone(parsed) || parsed.value.type !== "attach") {
								return write(new Socket.CloseEvent(4001, "First message must be attach"));
							}
							return doAttach(parsed.value.sessionId, parsed.value.cols, parsed.value.rows);
						}

						if (!session) return Effect.void;

						const parsed = parseMessage(msg);
						if (Option.isNone(parsed)) return session.write(msg);

						const control = parsed.value;
						switch (control.type) {
							case "resize":
								return session.clientResize(clientId, control.cols, control.rows);
							case "session_list_request":
								return Effect.gen(function* () {
									const sessions = yield* store.list();
									yield* sendJson(new SessionListResponse({type: "session_list", sessions}));
								});
							case "session_new":
								return doAttach(null, control.cols, control.rows);
							default:
								return Effect.void;
						}
					}),
				),
				// Cleanup: close client handle
				Effect.gen(function* () {
					if (handle) yield* handle.close;
				}),
			);
		}),
	);
