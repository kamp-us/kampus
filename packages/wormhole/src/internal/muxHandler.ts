/** @internal */
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
	readonly outputFiber: Fiber.RuntimeFiber<void>;
}

/** @internal */
export interface MuxHandler {
	readonly handleMessage: (data: Uint8Array) => Effect.Effect<void>;
	readonly cleanup: Effect.Effect<void>;
}

/** @internal */
export const make = (options: {
	readonly send: (data: Uint8Array) => Effect.Effect<void>;
	readonly close: (code: number, reason: string) => Effect.Effect<void>;
}): Effect.Effect<MuxHandler, never, SessionStore> =>
	Effect.gen(function* () {
		const store = yield* SessionStore;
		const clientId = crypto.randomUUID();
		const channelMap = yield* makeChannelMap();
		const encoder = new TextEncoder();
		const decoder = new TextDecoder();
		const entries = new Map<number, ChannelEntry>();
		const {send, close} = options;

		const sendControl = (msg: object) =>
			send(encodeBinaryFrame(CONTROL_CHANNEL, encoder.encode(JSON.stringify(msg))));

		const startOutputFiber = (channel: number, sessionId: string, handle: ClientHandle) =>
			Effect.gen(function* () {
				yield* Effect.raceFirst(
					handle.output.pipe(
						Stream.runForEach((data) => send(encodeBinaryFrame(channel, encoder.encode(data)))),
					),
					Deferred.await(handle.exited).pipe(Effect.asVoid),
				);
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
									yield* close(4002, `Failed to spawn PTY: ${e.shell}`);
									return undefined as Session | undefined;
								}),
							),
						);
						if (!session) return;

						const channelResult = yield* channelMap.assign(sessionId).pipe(Effect.either);
						if (channelResult._tag === "Left") {
							yield* close(4003, "Max channels exhausted");
							return;
						}
						const channel = channelResult.right;
						const handle = yield* session.attach(clientId, msg.cols, msg.rows);

						yield* sendControl(
							new SessionCreatedResponse({type: "session_created", sessionId, channel}),
						);
						const fiber = yield* startOutputFiber(channel, sessionId, handle).pipe(
							Effect.forkDaemon,
						);
						entries.set(channel, {session, handle, outputFiber: fiber});
						return;
					}
					case "session_attach": {
						const existing = yield* store.get(msg.sessionId);
						if (!existing) return;

						const exited = yield* existing.isExited;
						if (exited) {
							const respawnResult = yield* existing.respawn(msg.cols, msg.rows).pipe(Effect.either);
							if (respawnResult._tag === "Left") {
								yield* close(4002, `Failed to respawn PTY: ${respawnResult.left.shell}`);
								return;
							}
						}

						const attachChannelResult = yield* channelMap.assign(msg.sessionId).pipe(Effect.either);
						if (attachChannelResult._tag === "Left") {
							yield* close(4003, "Max channels exhausted");
							return;
						}
						const channel = attachChannelResult.right;
						const handle = yield* existing.attach(clientId, msg.cols, msg.rows);

						yield* sendControl(
							new SessionCreatedResponse({
								type: "session_created",
								sessionId: msg.sessionId,
								channel,
							}),
						);
						const fiber = yield* startOutputFiber(channel, msg.sessionId, handle).pipe(
							Effect.forkDaemon,
						);
						entries.set(channel, {session: existing, handle, outputFiber: fiber});
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
					case "session_destroy": {
						const channelOpt = channelMap.getChannel(msg.sessionId);
						if (Option.isSome(channelOpt)) {
							const channel = channelOpt.value;
							const entry = entries.get(channel);
							if (entry) {
								yield* entry.handle.close;
								yield* Fiber.interrupt(entry.outputFiber);
								entries.delete(channel);
								yield* channelMap.release(channel);
							}
						}
						yield* store.destroy(msg.sessionId);
						return;
					}
					default:
						return;
				}
			});

		const handleMessage = (data: Uint8Array): Effect.Effect<void> =>
			Effect.gen(function* () {
				const {channel, payload} = parseBinaryFrame(data);

				if (channel === CONTROL_CHANNEL) {
					let json: unknown;
					try {
						json = JSON.parse(decoder.decode(payload));
					} catch {
						return;
					}
					yield* handleControlMessage(json);
					return;
				}

				const sessionIdOpt = channelMap.getSessionId(channel);
				if (Option.isNone(sessionIdOpt)) return;
				const entry = entries.get(channel);
				if (!entry) return;
				yield* entry.session.write(decoder.decode(payload));
			});

		const cleanup: Effect.Effect<void> = Effect.gen(function* () {
			for (const [, entry] of entries) {
				yield* entry.handle.close;
				yield* Fiber.interrupt(entry.outputFiber);
			}
			entries.clear();
		});

		return {handleMessage, cleanup} satisfies MuxHandler;
	});
