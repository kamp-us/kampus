import {homedir} from "node:os";
import type {IPty} from "@lydell/node-pty";
import pty from "@lydell/node-pty";
import {RingBuffer} from "./ring-buffer.ts";

/**
 * PtySession — domain object encapsulating a single PTY lifecycle.
 *
 * Supports multiple simultaneous clients (mini-tmux model):
 * - N clients can attach() concurrently — output is broadcast to all
 * - Each client is identified by a unique clientId
 * - PTY dimensions = min(cols) × min(rows) across all clients (tmux policy)
 * - Session is "detached" when no clients are connected
 * - While detached, PTY output is buffered in a ring buffer (capped by byte size)
 * - On attach, buffered output is replayed to the joining client only
 * - dispose() is idempotent and kills the underlying PTY process
 * - onSessionEnd fires when the PTY exits (even while detached) for store cleanup
 */

export interface PtySessionOptions {
	id: string;
	cols: number;
	rows: number;
	bufferCapacity: number;
	onSessionEnd?: () => void;
}

interface ClientEntry {
	onData: (data: string) => void;
	onExit: (exitCode: number) => void;
	cols: number;
	rows: number;
}

export class PtySession {
	readonly id: string;
	private readonly pty: IPty;
	private readonly buffer: RingBuffer;
	private readonly onSessionEnd: (() => void) | undefined;
	private readonly clients = new Map<string, ClientEntry>();
	private disposed = false;

	constructor(options: PtySessionOptions) {
		this.id = options.id;
		this.buffer = new RingBuffer(options.bufferCapacity);
		this.onSessionEnd = options.onSessionEnd;

		const shell = getShell();

		this.pty = pty.spawn(shell, [], {
			name: "xterm-256color",
			cols: options.cols,
			rows: options.rows,
			cwd: homedir(),
			env: {
				...process.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
			},
		});

		this.pty.onData((data) => {
			if (this.disposed) return;
			this.buffer.push(data);
			for (const client of this.clients.values()) {
				client.onData(data);
			}
		});

		this.pty.onExit(({exitCode}) => {
			this.disposed = true;
			for (const client of this.clients.values()) {
				client.onExit(exitCode);
			}
			this.onSessionEnd?.();
		});
	}

	/** Attach a client — output will be broadcast to this client along with all others. */
	attach(
		clientId: string,
		onData: (data: string) => void,
		onExit: (exitCode: number) => void,
		cols: number,
		rows: number,
	): void {
		this.clients.set(clientId, {onData, onExit, cols, rows});

		// Replay recent output so joining client sees prior screen state
		for (const entry of this.buffer.snapshot()) {
			onData(entry);
		}

		this.recomputeSize();
	}

	/** Detach a client. PTY keeps running; size is recomputed for remaining clients. */
	detach(clientId: string): void {
		this.clients.delete(clientId);
		if (this.clients.size > 0) {
			this.recomputeSize();
		}
	}

	/** Update a specific client's viewport and recompute PTY size. */
	clientResize(clientId: string, cols: number, rows: number): void {
		const client = this.clients.get(clientId);
		if (!client) return;
		client.cols = cols;
		client.rows = rows;
		this.recomputeSize();
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	get clientCount(): number {
		return this.clients.size;
	}

	/**
	 * Handle an incoming WebSocket message.
	 * Only routes raw terminal input — control messages are handled by the server.
	 */
	handleMessage(data: string): void {
		if (this.disposed) return;
		this.pty.write(data);
	}

	/** Clean up PTY resources. Idempotent. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.pty.kill();
	}

	/**
	 * Recompute PTY size as min(cols) × min(rows) across all connected clients.
	 * This is the tmux default policy — ensures all clients can render correctly.
	 */
	private recomputeSize(): void {
		if (this.disposed || this.clients.size === 0) return;

		let minCols = Number.POSITIVE_INFINITY;
		let minRows = Number.POSITIVE_INFINITY;
		for (const client of this.clients.values()) {
			if (client.cols < minCols) minCols = client.cols;
			if (client.rows < minRows) minRows = client.rows;
		}

		try {
			this.pty.resize(minCols, minRows);
		} catch {
			// PTY may already be closed
		}
	}
}

function getShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe";
	}
	return process.env.SHELL || "/bin/bash";
}
