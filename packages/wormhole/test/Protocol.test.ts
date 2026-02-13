import {Option} from "effect";
import {describe, expect, test} from "vitest";
import {
	CONTROL_CHANNEL,
	encodeBinaryFrame,
	parseBinaryFrame,
	parseMessage,
	SessionCreatedResponse,
	SessionExitResponse,
	SessionDestroyRequest,
	SessionListResponse,
	SessionMessage,
} from "../src/Protocol.ts";

describe("Protocol", () => {
	describe("parseMessage", () => {
		test("parses attach message", () => {
			const msg = JSON.stringify({type: "attach", sessionId: "s1", cols: 80, rows: 24});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) {
				expect(result.value.type).toBe("attach");
			}
		});

		test("parses resize message", () => {
			const msg = JSON.stringify({type: "resize", cols: 120, rows: 40});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) {
				expect(result.value.type).toBe("resize");
			}
		});

		test("parses session_list_request", () => {
			const msg = JSON.stringify({type: "session_list_request"});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("parses session_new", () => {
			const msg = JSON.stringify({type: "session_new", cols: 80, rows: 24});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("returns None for raw terminal input", () => {
			expect(Option.isNone(parseMessage("ls -la\n"))).toBe(true);
		});

		test("returns None for invalid JSON starting with {", () => {
			expect(Option.isNone(parseMessage("{not valid json"))).toBe(true);
		});

		test("returns None for valid JSON with unknown type", () => {
			expect(Option.isNone(parseMessage(JSON.stringify({type: "unknown"})))).toBe(true);
		});

		test("attach with null sessionId", () => {
			const msg = JSON.stringify({type: "attach", sessionId: null, cols: 80, rows: 24});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("parses session_create", () => {
			const msg = JSON.stringify({type: "session_create", cols: 80, rows: 24});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) expect(result.value.type).toBe("session_create");
		});

		test("parses session_attach", () => {
			const msg = JSON.stringify({type: "session_attach", sessionId: "s1", cols: 80, rows: 24});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("parses session_detach", () => {
			const msg = JSON.stringify({type: "session_detach", sessionId: "s1"});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("parses session_resize", () => {
			const msg = JSON.stringify({type: "session_resize", sessionId: "s1", cols: 120, rows: 40});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
		});

		test("parses session_destroy", () => {
			const msg = JSON.stringify({type: "session_destroy", sessionId: "s1"});
			const result = parseMessage(msg);
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) expect(result.value.type).toBe("session_destroy");
		});
	});

	describe("server messages", () => {
		test("SessionMessage constructs correctly", () => {
			const msg = new SessionMessage({type: "session", sessionId: "s1"});
			expect(msg.type).toBe("session");
			expect(msg.sessionId).toBe("s1");
		});

		test("SessionListResponse constructs correctly", () => {
			const msg = new SessionListResponse({
				type: "session_list",
				sessions: [{id: "s1", clientCount: 2}],
			});
			expect(msg.sessions).toHaveLength(1);
		});

		test("SessionCreatedResponse constructs correctly", () => {
			const msg = new SessionCreatedResponse({
				type: "session_created",
				sessionId: "s1",
				channel: 0,
			});
			expect(msg.channel).toBe(0);
			expect(msg.sessionId).toBe("s1");
		});

		test("SessionExitResponse constructs correctly", () => {
			const msg = new SessionExitResponse({
				type: "session_exit",
				sessionId: "s1",
				channel: 0,
				exitCode: 0,
			});
			expect(msg.exitCode).toBe(0);
		});

		test("SessionDestroyRequest constructs correctly", () => {
			const msg = new SessionDestroyRequest({type: "session_destroy", sessionId: "s1"});
			expect(msg.type).toBe("session_destroy");
			expect(msg.sessionId).toBe("s1");
		});
	});

	describe("binary framing", () => {
		test("CONTROL_CHANNEL is 255", () => {
			expect(CONTROL_CHANNEL).toBe(255);
		});

		test("encodeBinaryFrame prepends channel byte", () => {
			const payload = new TextEncoder().encode("hello");
			const frame = encodeBinaryFrame(3, payload);
			expect(frame[0]).toBe(3);
			expect(frame.subarray(1)).toEqual(payload);
			expect(frame.length).toBe(payload.length + 1);
		});

		test("parseBinaryFrame extracts channel and payload", () => {
			const frame = new Uint8Array([7, 104, 101, 108, 108, 111]); // channel 7 + "hello"
			const result = parseBinaryFrame(frame);
			expect(result.channel).toBe(7);
			expect(new TextDecoder().decode(result.payload)).toBe("hello");
		});

		test("encodeBinaryFrame for control channel", () => {
			const json = JSON.stringify({type: "session_created", sessionId: "s1", channel: 0});
			const payload = new TextEncoder().encode(json);
			const frame = encodeBinaryFrame(CONTROL_CHANNEL, payload);
			expect(frame[0]).toBe(255);
		});
	});
});
