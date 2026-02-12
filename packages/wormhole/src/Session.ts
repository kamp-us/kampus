/**
 * PTY session multiplexer. Multiple clients can attach to a single PTY process.
 *
 * @since 0.0.1
 */
import type {Deferred, Effect, Scope, Stream} from "effect";
import type {PtySpawnError} from "./Errors.ts";
import * as internal from "./internal/session.ts";
import type {Pty} from "./Pty.ts";

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
export interface Session {
	readonly id: string;
	readonly clientCount: Effect.Effect<number>;
	readonly exited: Deferred.Deferred<number>;
	readonly attach: (clientId: string, cols: number, rows: number) => Effect.Effect<ClientHandle>;
	readonly write: (data: string) => Effect.Effect<void>;
	readonly clientResize: (clientId: string, cols: number, rows: number) => Effect.Effect<void>;
}

/**
 * @since 0.0.1
 * @category constructors
 */
export const make: (
	options: MakeOptions,
) => Effect.Effect<Session, PtySpawnError, Pty | Scope.Scope> = internal.make;
