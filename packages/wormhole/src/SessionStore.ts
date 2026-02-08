import {Effect} from "effect"
import {SessionNotFoundError} from "./Errors.ts"
import type {PtySession} from "./PtySession.ts"
import * as PtySessionModule from "./PtySession.ts"

const DEFAULT_BUFFER_CAPACITY = 100 * 1024 // 100KB

export class SessionStore extends Effect.Service<SessionStore>()("@kampus/wormhole/SessionStore", {
	effect: Effect.gen(function* () {
		const sessions = new Map<string, PtySession>()
		const bufferCapacity = Number(process.env.WORMHOLE_BUFFER_SIZE) || DEFAULT_BUFFER_CAPACITY

		const remove = (id: string): void => {
			const session = sessions.get(id)
			if (session) {
				Effect.runSync(session.dispose)
				sessions.delete(id)
			}
		}

		const create = Effect.fn("SessionStore.create")(function* (id: string, cols: number, rows: number) {
			const session = yield* PtySessionModule.make({
				id,
				cols,
				rows,
				bufferCapacity,
				onSessionEnd: () => remove(id),
			})
			sessions.set(id, session)
			return session
		})

		const get = Effect.fn("SessionStore.get")(function* (id: string) {
			const session = sessions.get(id)
			if (!session || session.isDisposed) {
				if (session?.isDisposed) sessions.delete(id)
				return undefined
			}
			return session
		})

		const getOrFail = Effect.fn("SessionStore.getOrFail")(function* (id: string) {
			const session = sessions.get(id)
			if (!session || session.isDisposed) {
				if (session?.isDisposed) sessions.delete(id)
				return yield* new SessionNotFoundError({sessionId: id})
			}
			return session
		})

		const list = Effect.fn("SessionStore.list")(function* () {
			return Array.from(sessions.values())
				.filter((s) => !s.isDisposed)
				.map((s) => ({id: s.id, clientCount: s.clientCount}))
		})

		const size = Effect.sync(() => sessions.size)

		return {create, get, getOrFail, list, size}
	}),
}) {}
