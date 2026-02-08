import {homedir} from "node:os"
import pty from "@lydell/node-pty"
import {Effect} from "effect"
import {PtySpawnError} from "./Errors.ts"
import {RingBuffer} from "./RingBuffer.ts"

export interface ClientEntry {
	readonly onData: (data: string) => void
	readonly onExit: (exitCode: number) => void
	cols: number
	rows: number
}

export interface PtySessionConfig {
	readonly id: string
	readonly cols: number
	readonly rows: number
	readonly bufferCapacity: number
	readonly onSessionEnd?: () => void
}

export interface PtySession {
	readonly id: string
	readonly isDisposed: boolean
	readonly clientCount: number
	readonly attach: (
		clientId: string,
		onData: (data: string) => void,
		onExit: (exitCode: number) => void,
		cols: number,
		rows: number,
	) => Effect.Effect<void>
	readonly detach: (clientId: string) => Effect.Effect<void>
	readonly clientResize: (clientId: string, cols: number, rows: number) => Effect.Effect<void>
	readonly write: (data: string) => Effect.Effect<void>
	readonly dispose: Effect.Effect<void>
}

function getShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe"
	}
	return process.env.SHELL || "/bin/bash"
}

export const make = (config: PtySessionConfig): Effect.Effect<PtySession, PtySpawnError> =>
	Effect.gen(function* () {
		const shell = getShell()
		const buffer = new RingBuffer(config.bufferCapacity)
		const clients = new Map<string, ClientEntry>()
		let disposed = false

		const proc = yield* Effect.try({
			try: () =>
				pty.spawn(shell, [], {
					name: "xterm-256color",
					cols: config.cols,
					rows: config.rows,
					cwd: homedir(),
					env: {...process.env, TERM: "xterm-256color", COLORTERM: "truecolor"},
				}),
			catch: (cause) => new PtySpawnError({shell, cause}),
		})

		proc.onData((data) => {
			if (disposed) return
			buffer.push(data)
			for (const client of clients.values()) {
				client.onData(data)
			}
		})

		proc.onExit(({exitCode}) => {
			disposed = true
			for (const client of clients.values()) {
				client.onExit(exitCode)
			}
			config.onSessionEnd?.()
		})

		const recomputeSize = (): void => {
			if (disposed || clients.size === 0) return
			let minCols = Number.POSITIVE_INFINITY
			let minRows = Number.POSITIVE_INFINITY
			for (const client of clients.values()) {
				if (client.cols < minCols) minCols = client.cols
				if (client.rows < minRows) minRows = client.rows
			}
			try {
				proc.resize(minCols, minRows)
			} catch {
				// PTY may already be closed
			}
		}

		const session: PtySession = {
			id: config.id,

			get isDisposed() {
				return disposed
			},

			get clientCount() {
				return clients.size
			},

			attach: (clientId, onData, onExit, cols, rows) =>
				Effect.sync(() => {
					clients.set(clientId, {onData, onExit, cols, rows})
					for (const entry of buffer.snapshot()) {
						onData(entry)
					}
					recomputeSize()
				}),

			detach: (clientId) =>
				Effect.sync(() => {
					clients.delete(clientId)
					if (clients.size > 0) {
						recomputeSize()
					}
				}),

			clientResize: (clientId, cols, rows) =>
				Effect.sync(() => {
					const client = clients.get(clientId)
					if (!client) return
					client.cols = cols
					client.rows = rows
					recomputeSize()
				}),

			write: (data) =>
				Effect.sync(() => {
					if (!disposed) {
						proc.write(data)
					}
				}),

			dispose: Effect.sync(() => {
				if (disposed) return
				disposed = true
				proc.kill()
			}),
		}

		return session
	})
