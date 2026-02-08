/** @internal */
import {homedir} from "node:os";
import pty from "@lydell/node-pty";
import {Deferred, Effect, Layer, type Scope, Stream} from "effect";
import {PtySpawnError} from "../Errors.ts";
import {Pty, type PtyProcess, type SpawnOptions} from "../Pty.ts";

const getDefaultShell = (): string =>
	process.platform === "win32"
		? process.env.COMSPEC || "cmd.exe"
		: process.env.SHELL || "/bin/bash";

const spawn = (options: SpawnOptions): Effect.Effect<PtyProcess, PtySpawnError, Scope.Scope> =>
	Effect.gen(function* () {
		const shell = options.shell ?? getDefaultShell();
		const exitDeferred = yield* Deferred.make<number>();

		const proc = yield* Effect.acquireRelease(
			Effect.try({
				try: () =>
					pty.spawn(shell, [...(options.args ?? [])], {
						name: "xterm-256color",
						cols: options.cols,
						rows: options.rows,
						cwd: options.cwd ?? homedir(),
						env: {
							...(options.env ?? process.env),
							TERM: "xterm-256color",
							COLORTERM: "truecolor",
						},
					}),
				catch: (cause) => new PtySpawnError({shell, cause}),
			}),
			(p) => Effect.sync(() => p.kill()),
		);

		proc.onExit(({exitCode}) => {
			Effect.runSync(Deferred.succeed(exitDeferred, exitCode));
		});

		const output = Stream.asyncPush<string>((emit) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					proc.onData((data) => emit.single(data));
					proc.onExit(() => emit.end());
				}),
				() => Effect.void,
			),
		);

		const guardAlive = (fn: () => void): Effect.Effect<void> =>
			Deferred.isDone(exitDeferred).pipe(
				Effect.flatMap((done) => (done ? Effect.void : Effect.sync(fn))),
			);

		return {
			output,
			awaitExit: Deferred.await(exitDeferred),
			write: (data) => guardAlive(() => proc.write(data)),
			resize: (cols, rows) => guardAlive(() => proc.resize(cols, rows)),
		} satisfies PtyProcess;
	});

/** @internal */
export const PtyLive: Layer.Layer<Pty> = Layer.succeed(Pty, Pty.of({spawn}));
