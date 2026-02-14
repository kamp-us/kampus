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

		const sendControl = (msg: object): Effect.Effect<void> =>
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

		const registerEntry = (
			channel: number,
			sessionId: string,
			session: Session,
			handle: ClientHandle,
		) =>
			Effect.gen(function* () {
				yield* sendControl(
					new SessionCreatedResponse({type: "session_created", sessionId, channel}),
				);
				const fiber = yield* startOutputFiber(channel, sessionId, handle).pipe(
					Effect.forkDaemon,
				);
				entries.set(channel, {session, handle, outputFiber: fiber});
			});

		const teardownEntry = (channel: number) =>
			Effect.gen(function* () {
				const entry = entries.get(channel);
				if (!entry) return;
				yield* entry.handle.close;
				yield* Fiber.interrupt(entry.outputFiber);
				entries.delete(channel);
				yield* channelMap.release(channel);
			});

		const assignChannel = (sessionId: string) =>
			channelMap.assign(sessionId).pipe(
				Effect.catchTag("ChannelExhaustedError", () =>
					close(4003, "Max channels exhausted").pipe(Effect.andThen(Effect.fail("bail" as const))),
				),
			);

		const handleControlMessage = (msg: Record<string, unknown>) =>
			Effect.gen(function* () {
				switch (msg.type) {
					case "session_create": {
						const sessionId = crypto.randomUUID();
						const session = yield* store
							.create(sessionId, msg.cols as number, msg.rows as number)
							.pipe(
								Effect.catchTag("PtySpawnError", (e) =>
									close(4002, `Failed to spawn PTY: ${e.shell}`).pipe(
										Effect.andThen(Effect.fail("bail" as const)),
									),
								),
							);

						const channel = yield* assignChannel(sessionId);
						const handle = yield* session.attach(
							clientId,
							msg.cols as number,
							msg.rows as number,
						);
						yield* registerEntry(channel, sessionId, session, handle);
						return;
					}
					case "session_attach": {
						const sessionId = msg.sessionId as string;
						const cols = msg.cols as number;
						const rows = msg.rows as number;
						const existing = yield* store.get(sessionId);
						if (!existing) return;

						if (yield* existing.isExited) {
							yield* existing.respawn(cols, rows).pipe(
								Effect.catchTag("PtySpawnError", (e) =>
									close(4002, `Failed to respawn PTY: ${e.shell}`).pipe(
										Effect.andThen(Effect.fail("bail" as const)),
									),
								),
							);
						}

						const channel = yield* assignChannel(sessionId);
						const handle = yield* existing.attach(clientId, cols, rows);
						yield* registerEntry(channel, sessionId, existing, handle);
						return;
					}
					case "session_detach": {
						const channelOpt = channelMap.getChannel(msg.sessionId as string);
						if (Option.isNone(channelOpt)) return;
						yield* teardownEntry(channelOpt.value);
						return;
					}
					case "session_resize": {
						const channelOpt = channelMap.getChannel(msg.sessionId as string);
						if (Option.isNone(channelOpt)) return;
						const entry = entries.get(channelOpt.value);
						if (!entry) return;
						yield* entry.session.clientResize(
							clientId,
							msg.cols as number,
							msg.rows as number,
						);
						return;
					}
					case "session_list_request": {
						const sessions = yield* store.list();
						yield* sendControl(new SessionListResponse({type: "session_list", sessions}));
						return;
					}
					case "session_destroy": {
						const sessionId = msg.sessionId as string;
						const channelOpt = channelMap.getChannel(sessionId);
						if (Option.isSome(channelOpt)) {
							yield* teardownEntry(channelOpt.value);
						}
						yield* store.destroy(sessionId);
						return;
					}
					case "session_rename": {
						const session = yield* store.get(msg.sessionId as string);
						if (!session) return;
						yield* session.setName(msg.name as string);
						return;
					}
					default:
						return;
				}
			}).pipe(Effect.catchAll((bail) => (bail === "bail" ? Effect.void : Effect.fail(bail))));

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
					yield* handleControlMessage(json as Record<string, unknown>);
					return;
				}

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
