/**
 * PTY session multiplexer. Multiple clients can attach to a single PTY process.
 *
 * @since 0.0.1
 */
import type {Deferred, Effect, Scope, Stream} from "effect";
import type {PtySpawnError} from "./Errors.ts";
import * as internal from "./internal/session.ts";
import type {Pty} from "./Pty.ts";
import type {SessionCheckpoint} from "./SessionCheckpoint.ts";

/**
 * @since 0.0.1
 * @category models
 */
export interface MakeOptions {
	readonly id: string;
	readonly cols: number;
	readonly rows: number;
	readonly bufferCapacity?: number | undefined;
}

/**
 * @since 0.0.1
 * @category models
 */
export interface ClientHandle {
	readonly output: Stream.Stream<string>;
	readonly exited: Deferred.Deferred<number>;
	readonly close: Effect.Effect<void>;
}

/**
 * @since 0.0.1
 * @category models
 */
export interface SessionMetadata {
	readonly name: string | null;
	readonly cwd: string | null;
	readonly createdAt: number;
}

/**
 * @since 0.0.1
 * @category models
 */
export interface Session {
	readonly id: string;
	readonly clientCount: Effect.Effect<number>;
	readonly exited: Deferred.Deferred<number>;
	readonly isExited: Effect.Effect<boolean>;
	readonly attach: (clientId: string, cols: number, rows: number) => Effect.Effect<ClientHandle>;
	readonly write: (data: string) => Effect.Effect<void>;
	readonly clientResize: (clientId: string, cols: number, rows: number) => Effect.Effect<void>;
	readonly metadata: Effect.Effect<SessionMetadata>;
	readonly setName: (name: string) => Effect.Effect<void>;
	readonly respawn: (cols: number, rows: number) => Effect.Effect<void, PtySpawnError>;
	readonly checkpoint: Effect.Effect<SessionCheckpoint>;
}

/**
 * @since 0.0.1
 * @category constructors
 */
export const make: (
	options: MakeOptions,
) => Effect.Effect<Session, PtySpawnError, Pty | Scope.Scope> = internal.make;

/**
 * Restore a session from a checkpoint. The session starts in exited state
 * (no PTY process). Call `respawn` to start a new PTY.
 *
 * @since 0.0.2
 * @category constructors
 */
export const restore: (
	checkpoint: SessionCheckpoint,
) => Effect.Effect<Session, never, Pty | Scope.Scope> = internal.restore;
