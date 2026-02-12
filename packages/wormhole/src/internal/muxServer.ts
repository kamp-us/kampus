/** @internal */
import * as Socket from "@effect/platform/Socket";
import {Deferred, Effect, Fiber, Option, Stream} from "effect";
import {
	CONTROL_CHANNEL,
	encodeBinaryFrame,
	parseBinaryFrame,
	SessionCreatedResponse,
	SessionExitResponse,
	SessionListResponse,
} from "../Protocol.ts";
import type {ClientHandle, Session} from "../Session.ts";
import {SessionStore} from "../SessionStore.ts";
import {make as makeChannelMap} from "./channelMap.ts";

interface ChannelEntry {
	readonly session: Session;
	readonly handle: ClientHandle;
	readonly outputFiber: Fiber.RuntimeFiber<void, Socket.SocketError>;
}

/** @internal */
export const handleMuxConnection = (socket: Socket.Socket) =>
	Effect.scoped(
		Effect.gen(function* () {
			const store = yield* SessionStore;
			const write = yield* socket.writer;
			const clientId = crypto.randomUUID();
			const channelMap = yield* makeChannelMap();
			const encoder = new TextEncoder();
			const decoder = new TextDecoder();

			// Active channel entries keyed by channel number
			const entries = new Map<number, ChannelEntry>();

			const sendControl = (msg: object) =>
				write(encodeBinaryFrame(CONTROL_CHANNEL, encoder.encode(JSON.stringify(msg))));

			const startOutputFiber = (channel: number, sessionId: string, handle: ClientHandle) =>
				Effect.gen(function* () {
					// Race output streaming against PTY exit so we react promptly
					yield* Effect.raceFirst(
						handle.output.pipe(
							Stream.runForEach((data) => write(encodeBinaryFrame(channel, encoder.encode(data)))),
						),
						Deferred.await(handle.exited).pipe(Effect.asVoid),
					);
					// Only send exit notification if PTY actually exited (not detach/close)
					if (yield* Deferred.isDone(handle.exited)) {
						const exitCode = yield* Deferred.await(handle.exited);
						yield* sendControl(
							new SessionExitResponse({type: "session_exit", sessionId, channel, exitCode}),
						);
					}
				});

			const handleControlMessage = (msg: any) =>
				Effect.gen(function* () {
					switch (msg.type) {
						case "session_create": {
							const sessionId = crypto.randomUUID();
							const session = yield* store.create(sessionId, msg.cols, msg.rows).pipe(
								Effect.catchTag("PtySpawnError", (e) =>
									Effect.gen(function* () {
										yield* write(new Socket.CloseEvent(4002, `Failed to spawn PTY: ${e.shell}`));
										return undefined as Session | undefined;
									}),
								),
							);
							if (!session) return;

							const channelResult = yield* channelMap.assign(sessionId).pipe(Effect.either);
							if (channelResult._tag === "Left") {
								yield* write(new Socket.CloseEvent(4003, "Max channels exhausted"));
								return;
							}
							const channel = channelResult.right;
							const handle = yield* session.attach(clientId, msg.cols, msg.rows);
							const fiber = yield* startOutputFiber(channel, sessionId, handle).pipe(Effect.fork);
							entries.set(channel, {session, handle, outputFiber: fiber});

							yield* sendControl(
								new SessionCreatedResponse({type: "session_created", sessionId, channel}),
							);
							return;
						}
						case "session_attach": {
							const existing = yield* store.get(msg.sessionId);
							if (!existing) return;

							const attachChannelResult = yield* channelMap
								.assign(msg.sessionId)
								.pipe(Effect.either);
							if (attachChannelResult._tag === "Left") {
								yield* write(new Socket.CloseEvent(4003, "Max channels exhausted"));
								return;
							}
							const channel = attachChannelResult.right;
							const handle = yield* existing.attach(clientId, msg.cols, msg.rows);
							const fiber = yield* startOutputFiber(channel, msg.sessionId, handle).pipe(
								Effect.fork,
							);
							entries.set(channel, {session: existing, handle, outputFiber: fiber});

							yield* sendControl(
								new SessionCreatedResponse({
									type: "session_created",
									sessionId: msg.sessionId,
									channel,
								}),
							);
							return;
						}
						case "session_detach": {
							const channelOpt = channelMap.getChannel(msg.sessionId);
							if (Option.isNone(channelOpt)) return;
							const channel = channelOpt.value;
							const entry = entries.get(channel);
							if (!entry) return;

							yield* entry.handle.close;
							yield* Fiber.interrupt(entry.outputFiber);
							entries.delete(channel);
							yield* channelMap.release(channel);
							return;
						}
						case "session_resize": {
							const channelOpt = channelMap.getChannel(msg.sessionId);
							if (Option.isNone(channelOpt)) return;
							const entry = entries.get(channelOpt.value);
							if (!entry) return;
							yield* entry.session.clientResize(clientId, msg.cols, msg.rows);
							return;
						}
						case "session_list_request": {
							const sessions = yield* store.list();
							yield* sendControl(new SessionListResponse({type: "session_list", sessions}));
							return;
						}
						default:
							return;
					}
				});

			const cleanup = Effect.gen(function* () {
				for (const [, entry] of entries) {
					yield* entry.handle.close;
					yield* Fiber.interrupt(entry.outputFiber);
				}
				entries.clear();
			});

			yield* Effect.ensuring(
				socket.runRaw((data) => {
					const bytes = typeof data === "string" ? encoder.encode(data) : (data as Uint8Array);
					const {channel, payload} = parseBinaryFrame(bytes);

					if (channel === CONTROL_CHANNEL) {
						let json: unknown;
						try {
							json = JSON.parse(decoder.decode(payload));
						} catch {
							return Effect.void;
						}
						return handleControlMessage(json);
					}

					// Route data to the session mapped to this channel
					const sessionIdOpt = channelMap.getSessionId(channel);
					if (Option.isNone(sessionIdOpt)) return Effect.void;
					const entry = entries.get(channel);
					if (!entry) return Effect.void;
					return entry.session.write(decoder.decode(payload));
				}),
				cleanup,
			);
		}),
	);
