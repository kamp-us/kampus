/**
 * WebSocket connection handler for wormhole sessions.
 *
 * @since 0.0.1
 */
import type * as Socket from "@effect/platform/Socket";
import type {Effect} from "effect";
import * as muxHandlerInternal from "./internal/muxHandler.ts";
import * as internal from "./internal/server.ts";
import type {SessionStore} from "./SessionStore.ts";

/**
 * @since 0.0.1
 * @category handlers
 */
export const handleConnection: (
	socket: Socket.Socket,
) => Effect.Effect<void, Socket.SocketError, SessionStore> = internal.handleConnection;

/**
 * @since 0.0.3
 * @category handlers
 */
export const makeMuxHandler: (options: {
	readonly send: (data: Uint8Array) => Effect.Effect<void>;
	readonly close: (code: number, reason: string) => Effect.Effect<void>;
}) => Effect.Effect<muxHandlerInternal.MuxHandler, never, SessionStore> = muxHandlerInternal.make;

/**
 * @since 0.0.3
 * @category types
 */
export type MuxHandler = muxHandlerInternal.MuxHandler;
