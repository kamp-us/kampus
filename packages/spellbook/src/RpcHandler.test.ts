import {Rpc, RpcGroup, RpcSerialization} from "@effect/rpc"
import {Effect, Layer, Schema} from "effect"
import {describe, expect, it} from "vitest"
import * as RpcHandler from "./RpcHandler"

/** Type for Effect RPC response format */
interface RpcResponse {
	_tag: "Exit"
	requestId: string
	exit: {_tag: "Success" | "Failure"; value?: unknown}
}

/**
 * Simple RPC group for testing.
 */
const TestRpcs = RpcGroup.make(
	Rpc.make("echo", {
		payload: {message: Schema.String},
		success: Schema.Struct({reply: Schema.String}),
	}),
	Rpc.make("add", {
		payload: {a: Schema.Number, b: Schema.Number},
		success: Schema.Number,
	}),
)

/**
 * Handler implementations for test RPCs.
 */
const TestHandlersLayer = TestRpcs.toLayer({
	echo: ({message}) => Effect.succeed({reply: `Echo: ${message}`}),
	add: ({a, b}) => Effect.succeed(a + b),
})

/**
 * Creates a test layer with RpcHandler and required dependencies.
 * RpcSerialization and handlers must be provided BEFORE RpcHandler.layer
 * since RpcServer.toHttpApp needs them during layer construction.
 */
const makeTestLayer = () =>
	Layer.mergeAll(RpcHandler.layer(TestRpcs), Layer.scope).pipe(
		Layer.provide(TestHandlersLayer),
		Layer.provide(RpcSerialization.layerJson),
	)

/**
 * Creates a JSON RPC request in Effect RPC protocol format.
 */
const makeRpcRequest = (tag: string, payload: unknown) =>
	new Request("http://test/rpc", {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			_tag: "Request",
			id: String(Date.now()),
			tag,
			payload,
			headers: [],
		}),
	})

describe("RpcHandler", () => {
	describe("layer", () => {
		it("creates a working RpcHandler service", async () => {
			const result = await Effect.gen(function* () {
				const handler = yield* RpcHandler.RpcHandler
				return typeof handler.handle
			}).pipe(Effect.provide(makeTestLayer()), Effect.runPromise)

			expect(result).toBe("function")
		})

		it("handle processes echo RPC correctly", async () => {
			const result = await Effect.gen(function* () {
				const handler = yield* RpcHandler.RpcHandler
				const request = makeRpcRequest("echo", {message: "hello"})
				const response = yield* handler.handle(request)
				return response
			}).pipe(Effect.provide(makeTestLayer()), Effect.runPromise)

			expect(result.ok).toBe(true)
			const body = (await result.json()) as RpcResponse[]
			// Response format: [{ _tag: "Exit", requestId, exit: { _tag: "Success", value } }]
			expect(body[0].exit.value).toEqual({reply: "Echo: hello"})
		})

		it("handle processes add RPC correctly", async () => {
			const result = await Effect.gen(function* () {
				const handler = yield* RpcHandler.RpcHandler
				const request = makeRpcRequest("add", {a: 2, b: 3})
				const response = yield* handler.handle(request)
				return response
			}).pipe(Effect.provide(makeTestLayer()), Effect.runPromise)

			expect(result.ok).toBe(true)
			const body = (await result.json()) as RpcResponse[]
			expect(body[0].exit.value).toBe(5)
		})

		it("same handler instance handles multiple requests", async () => {
			const responses = await Effect.gen(function* () {
				const handler = yield* RpcHandler.RpcHandler
				const r1 = yield* handler.handle(makeRpcRequest("echo", {message: "first"}))
				const r2 = yield* handler.handle(makeRpcRequest("echo", {message: "second"}))
				const r3 = yield* handler.handle(makeRpcRequest("add", {a: 10, b: 20}))
				return [r1, r2, r3]
			}).pipe(Effect.provide(makeTestLayer()), Effect.runPromise)

			const results = (await Promise.all(responses.map((r) => r.json()))) as RpcResponse[][]
			expect(results[0][0].exit.value).toEqual({reply: "Echo: first"})
			expect(results[1][0].exit.value).toEqual({reply: "Echo: second"})
			expect(results[2][0].exit.value).toBe(30)
		})
	})

	describe("handleRpc (deprecated)", () => {
		it("still works for backwards compatibility", async () => {
			const result = await Effect.gen(function* () {
				const request = makeRpcRequest("echo", {message: "legacy"})
				const response = yield* RpcHandler.handleRpc(TestRpcs, request)
				return response
			}).pipe(
				Effect.provide(Layer.mergeAll(TestHandlersLayer, RpcSerialization.layerJson)),
				Effect.scoped,
				Effect.runPromise,
			)

			expect(result.ok).toBe(true)
			const body = await result.json()
			// Response format: [{ _tag: "Exit", exit: { _tag: "Success", value } }]
			expect(body).toEqual([{_tag: "Exit", requestId: expect.any(String), exit: {_tag: "Success", value: {reply: "Echo: legacy"}}}])
		})
	})
})
