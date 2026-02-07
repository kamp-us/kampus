import {describe, expect, test} from "vitest";
import {parseMessage} from "../src/protocol.ts";

describe("parseMessage", () => {
	test("parses valid resize message", () => {
		const msg = parseMessage('{"type":"resize","cols":120,"rows":40}');
		expect(msg).toEqual({type: "resize", cols: 120, rows: 40});
	});

	test("parses valid attach message with null sessionId", () => {
		const msg = parseMessage('{"type":"attach","sessionId":null,"cols":80,"rows":24}');
		expect(msg).toEqual({type: "attach", sessionId: null, cols: 80, rows: 24});
	});

	test("parses valid attach message with string sessionId", () => {
		const msg = parseMessage(
			'{"type":"attach","sessionId":"abc-123","cols":120,"rows":40}',
		);
		expect(msg).toEqual({type: "attach", sessionId: "abc-123", cols: 120, rows: 40});
	});

	test("returns null for raw terminal input", () => {
		expect(parseMessage("ls -la")).toBeNull();
		expect(parseMessage("hello\r\n")).toBeNull();
	});

	test("returns null for non-resize JSON", () => {
		expect(parseMessage('{"type":"unknown"}')).toBeNull();
	});

	test("returns null for invalid JSON starting with {", () => {
		expect(parseMessage("{not json")).toBeNull();
	});

	test("returns null for resize missing cols", () => {
		expect(parseMessage('{"type":"resize","rows":24}')).toBeNull();
	});

	test("returns null for resize with wrong types", () => {
		expect(parseMessage('{"type":"resize","cols":"80","rows":"24"}')).toBeNull();
	});

	test("returns null for attach missing cols", () => {
		expect(parseMessage('{"type":"attach","sessionId":null,"rows":24}')).toBeNull();
	});

	test("returns null for attach with numeric sessionId", () => {
		expect(parseMessage('{"type":"attach","sessionId":123,"cols":80,"rows":24}')).toBeNull();
	});
});
