import {beforeEach, describe, expect, test, vi} from "vitest"
import {Effect} from "effect"
import {createMockPty, mockPtyState, resetPtyMock} from "./mocks/node-pty.ts"
import {make} from "../src/PtySession.ts"

vi.mock("@lydell/node-pty", () => createMockPty())

const defaultConfig = {id: "test-session", cols: 80, rows: 24, bufferCapacity: 100 * 1024}

describe("PtySession multi-client", () => {
	beforeEach(() => {
		resetPtyMock()
	})

	test("broadcasts output to all attached clients", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				const received1: string[] = []
				const received2: string[] = []

				yield* session.attach("c1", (d) => received1.push(d), () => {}, 80, 24)
				yield* session.attach("c2", (d) => received2.push(d), () => {}, 80, 24)

				mockPtyState.dataCb?.("hello")

				expect(received1).toEqual(["hello"])
				expect(received2).toEqual(["hello"])
			}),
		)
	})

	test("detaching one client does not affect the other", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				const received1: string[] = []
				const received2: string[] = []

				yield* session.attach("c1", (d) => received1.push(d), () => {}, 80, 24)
				yield* session.attach("c2", (d) => received2.push(d), () => {}, 80, 24)

				yield* session.detach("c1")
				mockPtyState.dataCb?.("after-detach")

				expect(received1).toEqual([])
				expect(received2).toEqual(["after-detach"])
			}),
		)
	})

	test("new client gets ring buffer replay on attach", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				yield* session.attach("c1", () => {}, () => {}, 80, 24)
				mockPtyState.dataCb?.("line1")
				mockPtyState.dataCb?.("line2")

				const received: string[] = []
				yield* session.attach("c2", (d) => received.push(d), () => {}, 80, 24)

				expect(received).toEqual(["line1", "line2"])
			}),
		)
	})

	test("clientCount reflects connected client count", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				expect(session.clientCount).toBe(0)

				yield* session.attach("c1", () => {}, () => {}, 80, 24)
				expect(session.clientCount).toBe(1)

				yield* session.attach("c2", () => {}, () => {}, 80, 24)
				expect(session.clientCount).toBe(2)

				yield* session.detach("c1")
				expect(session.clientCount).toBe(1)

				yield* session.detach("c2")
				expect(session.clientCount).toBe(0)
			}),
		)
	})

	test("PTY size is min(cols) x min(rows) across clients", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				yield* session.attach("c1", () => {}, () => {}, 120, 40)
				expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 120, rows: 40})

				yield* session.attach("c2", () => {}, () => {}, 80, 24)
				expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 80, rows: 24})
			}),
		)
	})

	test("PTY size recomputes when a smaller client detaches", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				yield* session.attach("c1", () => {}, () => {}, 120, 40)
				yield* session.attach("c2", () => {}, () => {}, 80, 24)

				yield* session.detach("c2")
				expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 120, rows: 40})
			}),
		)
	})

	test("clientResize updates size computation", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				yield* session.attach("c1", () => {}, () => {}, 120, 40)
				yield* session.attach("c2", () => {}, () => {}, 100, 30)

				yield* session.clientResize("c2", 60, 20)
				expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 60, rows: 20})
			}),
		)
	})

	test("onExit broadcasts to all clients", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const session = yield* make(defaultConfig)
				const exits1: number[] = []
				const exits2: number[] = []

				yield* session.attach("c1", () => {}, (code) => exits1.push(code), 80, 24)
				yield* session.attach("c2", () => {}, (code) => exits2.push(code), 80, 24)

				mockPtyState.exitCb?.({exitCode: 0})

				expect(exits1).toEqual([0])
				expect(exits2).toEqual([0])
			}),
		)
	})
})
