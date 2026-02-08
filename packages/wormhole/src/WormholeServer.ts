import * as Socket from "@effect/platform/Socket"
import {Effect, Option} from "effect"
import {parseMessage, SessionListResponse, SessionMessage} from "./Protocol.ts"
import type {PtySession} from "./PtySession.ts"
import {SessionStore} from "./SessionStore.ts"

/**
 * Per-connection handler for the wormhole WebSocket server.
 *
 * Each WS connection gets its own fiber running this handler.
 * The handler receives a Socket (bidirectional byte pipe) from
 * @effect/platform's SocketServer.
 */
export const handleConnection = (socket: Socket.Socket) =>
	Effect.scoped(
		Effect.gen(function* () {
			const store = yield* SessionStore
			const write = yield* socket.writer
			const clientId = crypto.randomUUID()
			const encoder = new TextEncoder()
			const decoder = new TextDecoder()

			let session: PtySession | undefined
			let attached = false

			const sendJson = (msg: object) => write(encoder.encode(JSON.stringify(msg)))

			const doAttach = Effect.fn("WormholeServer.doAttach")(function* (
				sessionId: string | null,
				cols: number,
				rows: number,
			) {
				if (sessionId) {
					const existing = yield* store.get(sessionId)
					if (existing) session = existing
				}

				if (!session) {
					const id = sessionId ?? crypto.randomUUID()
					session = yield* store.create(id, cols, rows).pipe(
						Effect.catchTag("PtySpawnError", (e) =>
							Effect.gen(function* () {
								yield* write(new Socket.CloseEvent(4002, `Failed to spawn PTY: ${e.shell}`))
								return undefined as PtySession | undefined
							}),
						),
					)
					if (!session) return
				}

				yield* session.attach(
					clientId,
					(data) => {
						Effect.runSync(write(encoder.encode(data)))
					},
					(exitCode) => {
						const msg = `\r\n\x1b[33mShell exited (code: ${exitCode})\x1b[0m\r\n`
						Effect.runSync(write(encoder.encode(msg)))
						Effect.runSync(write(new Socket.CloseEvent(1000)))
					},
					cols,
					rows,
				)

				yield* sendJson(new SessionMessage({type: "session", sessionId: session.id}))
				attached = true
			})

			yield* Effect.ensuring(
				socket.runRaw((data) => {
					const msg = typeof data === "string" ? data : decoder.decode(data as Uint8Array)

					if (!attached) {
						const parsed = parseMessage(msg)
						if (Option.isNone(parsed) || parsed.value.type !== "attach") {
							return write(new Socket.CloseEvent(4001, "First message must be attach"))
						}
						return doAttach(parsed.value.sessionId, parsed.value.cols, parsed.value.rows)
					}

					if (!session) return Effect.void

					const parsed = parseMessage(msg)
					if (Option.isNone(parsed)) {
						return session.write(msg)
					}

					const control = parsed.value
					switch (control.type) {
						case "resize":
							return session.clientResize(clientId, control.cols, control.rows)
						case "session_list_request":
							return Effect.gen(function* () {
								const sessions = yield* store.list()
								yield* sendJson(new SessionListResponse({type: "session_list", sessions}))
							})
						case "session_new":
							return doAttach(null, control.cols, control.rows)
						default:
							return Effect.void
					}
				}),
				Effect.sync(() => {
					if (session && !session.isDisposed) {
						Effect.runSync(session.detach(clientId))
					}
				}),
			)
		}),
	)
