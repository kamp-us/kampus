import {PtySession} from "./pty-session.ts";

const DEFAULT_BUFFER_CAPACITY = 100 * 1024; // 100KB

/**
 * SessionStore — manages PtySession lifetimes independently of WebSocket connections.
 *
 * Sessions live until their shell exits. The PTY's onSessionEnd callback
 * triggers automatic cleanup — no orphan timers needed.
 */
export class SessionStore {
	private readonly sessions = new Map<string, PtySession>();
	readonly bufferCapacity: number;

	constructor(bufferCapacity?: number) {
		this.bufferCapacity =
			bufferCapacity ?? (Number(process.env.WORMHOLE_BUFFER_SIZE) || DEFAULT_BUFFER_CAPACITY);
	}

	/** Create a new session and register it in the store. */
	create(id: string, cols: number, rows: number): PtySession {
		const session = new PtySession({
			id,
			cols,
			rows,
			bufferCapacity: this.bufferCapacity,
			onSessionEnd: () => this.remove(session.id),
		});
		this.sessions.set(session.id, session);
		return session;
	}

	/** Get a session by ID, or undefined if not found / already disposed. */
	get(id: string): PtySession | undefined {
		const session = this.sessions.get(id);
		if (session?.isDisposed) {
			this.sessions.delete(id);
			return undefined;
		}
		return session;
	}

	/** Dispose and remove a session. */
	remove(id: string): void {
		const session = this.sessions.get(id);
		if (session) {
			session.dispose();
			this.sessions.delete(id);
		}
	}

	get size(): number {
		return this.sessions.size;
	}
}
