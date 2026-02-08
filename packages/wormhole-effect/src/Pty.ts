import {Context, type Effect, type Scope, type Stream} from "effect";
import type {PtySpawnError} from "./Errors.ts";

/**
 * @since 0.0.1
 * @category models
 */
export interface SpawnOptions {
	readonly cols: number;
	readonly rows: number;
	readonly shell?: string | undefined;
	readonly args?: ReadonlyArray<string> | undefined;
	readonly cwd?: string | undefined;
	readonly env?: Record<string, string> | undefined;
}

/**
 * @since 0.0.1
 * @category models
 */
export interface PtyProcess {
	readonly output: Stream.Stream<string>;
	readonly awaitExit: Effect.Effect<number>;
	readonly write: (data: string) => Effect.Effect<void>;
	readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
}

/**
 * @since 0.0.1
 * @category tags
 */
export class Pty extends Context.Tag("@kampus/wormhole-effect/Pty")<
	Pty,
	{
		readonly spawn: (
			options: SpawnOptions,
		) => Effect.Effect<PtyProcess, PtySpawnError, Scope.Scope>;
	}
>() {}
