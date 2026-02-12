/**
 * WebSocket connection handler for wormhole sessions.
 *
 * @since 0.0.1
 */
import type * as Socket from "@effect/platform/Socket";
import type {Effect} from "effect";
import * as internal from "./internal/server.ts";
import * as muxInternal from "./internal/muxServer.ts";
import type {SessionStore} from "./SessionStore.ts";

/**
 * @since 0.0.1
 * @category handlers
 */
export const handleConnection: (
	socket: Socket.Socket,
) => Effect.Effect<void, Socket.SocketError, SessionStore> = internal.handleConnection;

/**
 * @since 0.0.2
 * @category handlers
 */
export const handleMuxConnection: (
	socket: Socket.Socket,
) => Effect.Effect<void, Socket.SocketError, SessionStore> = muxInternal.handleMuxConnection;
