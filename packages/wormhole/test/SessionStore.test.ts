import {beforeEach, describe, expect, test, vi} from "vitest"
import {Effect} from "effect"
import {createMockPty, mockPtyState, resetPtyMock} from "./mocks/node-pty.ts"
import {SessionStore} from "../src/SessionStore.ts"

vi.mock("@lydell/node-pty", () => createMockPty())

describe("SessionStore", () => {
	beforeEach(() => {
		resetPtyMock()
	})

	const run = <A, E>(effect: Effect.Effect<A, E, SessionStore>) =>
		Effect.runPromise(effect.pipe(Effect.provide(SessionStore.Default)))

	test("create returns a session with unique id", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const s1 = yield* store.create("id-1", 80, 24)
				const s2 = yield* store.create("id-2", 80, 24)
				expect(s1.id).toBe("id-1")
				expect(s2.id).toBe("id-2")
				expect(s1.id).not.toBe(s2.id)
				const size = yield* store.size
				expect(size).toBe(2)
			}),
		)
	})

	test("get returns session by id", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const session = yield* store.create("test-id", 80, 24)
				const found = yield* store.get(session.id)
				expect(found).toBe(session)
			}),
		)
	})

	test("get returns undefined for unknown id", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const found = yield* store.get("nonexistent")
				expect(found).toBeUndefined()
			}),
		)
	})

	test("attach replays buffered output from detached period", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const session = yield* store.create("test-id", 80, 24)

				mockPtyState.dataCb?.("hello")
				mockPtyState.dataCb?.(" world")

				const received: string[] = []
				yield* session.attach("client-1", (data) => received.push(data), () => {}, 80, 24)

				expect(received).toEqual(["hello", " world"])
			}),
		)
	})

	test("attach replays output produced while attached then detached", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const session = yield* store.create("test-id", 80, 24)

				const first: string[] = []
				yield* session.attach("client-1", (data) => first.push(data), () => {}, 80, 24)
				mockPtyState.dataCb?.("line1")
				expect(first).toEqual(["line1"])

				yield* session.detach("client-1")

				const second: string[] = []
				yield* session.attach("client-2", (data) => second.push(data), () => {}, 80, 24)
				expect(second).toEqual(["line1"])
			}),
		)
	})

	test("no buffered data replayed when nothing was produced", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				const session = yield* store.create("test-id", 80, 24)

				const received: string[] = []
				yield* session.attach("client-1", (data) => received.push(data), () => {}, 80, 24)

				expect(received).toEqual([])
			}),
		)
	})

	test("list returns active sessions", async () => {
		await run(
			Effect.gen(function* () {
				const store = yield* SessionStore
				yield* store.create("s1", 80, 24)
				yield* store.create("s2", 80, 24)

				const sessions = yield* store.list()
				expect(sessions).toHaveLength(2)
				expect(sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"])
			}),
		)
	})
})
