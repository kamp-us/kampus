import {Option} from "effect";
import {describe, expect, test} from "vitest";
import {parseMessage, SessionListResponse, SessionMessage} from "../src/Protocol.ts";

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
	});
});
