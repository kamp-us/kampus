import {describe, expect, test} from "vitest"
import {Option} from "effect"
import {parseMessage} from "../src/Protocol.ts"

describe("parseMessage", () => {
	test("parses valid resize message", () => {
		const msg = parseMessage('{"type":"resize","cols":120,"rows":40}')
		expect(Option.isSome(msg)).toBe(true)
		expect(Option.getOrThrow(msg)).toMatchObject({type: "resize", cols: 120, rows: 40})
	})

	test("parses valid attach message with null sessionId", () => {
		const msg = parseMessage('{"type":"attach","sessionId":null,"cols":80,"rows":24}')
		expect(Option.isSome(msg)).toBe(true)
		expect(Option.getOrThrow(msg)).toMatchObject({type: "attach", sessionId: null, cols: 80, rows: 24})
	})

	test("parses valid attach message with string sessionId", () => {
		const msg = parseMessage('{"type":"attach","sessionId":"abc-123","cols":120,"rows":40}')
		expect(Option.isSome(msg)).toBe(true)
		expect(Option.getOrThrow(msg)).toMatchObject({
			type: "attach",
			sessionId: "abc-123",
			cols: 120,
			rows: 40,
		})
	})

	test("returns None for raw terminal input", () => {
		expect(Option.isNone(parseMessage("ls -la"))).toBe(true)
		expect(Option.isNone(parseMessage("hello\r\n"))).toBe(true)
	})

	test("returns None for non-resize JSON", () => {
		expect(Option.isNone(parseMessage('{"type":"unknown"}'))).toBe(true)
	})

	test("returns None for invalid JSON starting with {", () => {
		expect(Option.isNone(parseMessage("{not json"))).toBe(true)
	})

	test("returns None for resize missing cols", () => {
		expect(Option.isNone(parseMessage('{"type":"resize","rows":24}'))).toBe(true)
	})

	test("returns None for resize with wrong types", () => {
		expect(Option.isNone(parseMessage('{"type":"resize","cols":"80","rows":"24"}'))).toBe(true)
	})

	test("returns None for attach missing cols", () => {
		expect(Option.isNone(parseMessage('{"type":"attach","sessionId":null,"rows":24}'))).toBe(true)
	})

	test("returns None for attach with numeric sessionId", () => {
		expect(Option.isNone(parseMessage('{"type":"attach","sessionId":123,"cols":80,"rows":24}'))).toBe(true)
	})
})
