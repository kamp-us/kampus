/** @internal */
import {Config, Effect, Exit, Ref, Scope} from "effect";
import {SessionNotFoundError} from "../Errors.ts";
import {Pty} from "../Pty.ts";
import type {Session} from "../Session.ts";
import * as SessionModule from "../Session.ts";

const DEFAULT_BUFFER_CAPACITY = 100 * 1024;

interface SessionEntry {
	readonly session: Session;
	readonly scope: Scope.CloseableScope;
}

/** @internal */
export const make = Effect.gen(function* () {
	const pty = yield* Pty;
	const entries = yield* Ref.make<Map<string, SessionEntry>>(new Map());
	const bufferCapacity = yield* Config.number("WORMHOLE_BUFFER_SIZE").pipe(
		Config.withDefault(DEFAULT_BUFFER_CAPACITY),
	);

	const create = (id: string, cols: number, rows: number) =>
		Effect.gen(function* () {
			const sessionScope = yield* Scope.make();

			const session = yield* SessionModule.make({
				id,
				cols,
				rows,
				bufferCapacity,
			}).pipe(Effect.provideService(Pty, pty), Effect.provideService(Scope.Scope, sessionScope));

			yield* Ref.update(entries, (map) => {
				const next = new Map(map);
				next.set(id, {session, scope: sessionScope});
				return next;
			});

			return session;
		});

	const get = (id: string) =>
		Effect.gen(function* () {
			const map = yield* Ref.get(entries);
			return map.get(id)?.session;
		});

	const getOrFail = (id: string) =>
		Effect.gen(function* () {
			const session = yield* get(id);
			if (!session) return yield* new SessionNotFoundError({sessionId: id});
			return session;
		});

	const list = Effect.gen(function* () {
		const map = yield* Ref.get(entries);
		const result: Array<{
			id: string;
			clientCount: number;
			isExited: boolean;
			name: string | null;
			cwd: string | null;
			lastActiveAt: number;
		}> = [];
		for (const {session} of map.values()) {
			const count = yield* session.clientCount;
			const exited = yield* session.isExited;
			const meta = yield* session.metadata;
			result.push({
				id: session.id,
				clientCount: count,
				isExited: exited,
				name: meta.name,
				cwd: meta.cwd,
				lastActiveAt: Date.now(),
			});
		}
		return result;
	});

	const size = Ref.get(entries).pipe(Effect.map((map) => map.size));

	const destroy = (id: string) =>
		Effect.gen(function* () {
			const map = yield* Ref.get(entries);
			const entry = map.get(id);
			if (!entry) return;
			yield* Ref.update(entries, (m) => {
				const next = new Map(m);
				next.delete(id);
				return next;
			});
			yield* Scope.close(entry.scope, Exit.void);
		});

	return {create, get, getOrFail, list: () => list, size, destroy};
});
