import {describe, it, expect} from "vitest";
import * as S from "effect/Schema";
import {
	ClientMessage,
	ServerMessage,
	encodeBinaryFrame,
	parseBinaryFrame,
	CONTROL_CHANNEL,
} from "../src/Protocol.ts";

describe("Protocol", () => {
	describe("ClientMessage", () => {
		it("decodes connect message", () => {
			const raw = {type: "connect", width: 1200, height: 800};
			const result = S.decodeUnknownSync(ClientMessage)(raw);
			expect(result.type).toBe("connect");
			if (result.type === "connect") {
				expect(result.width).toBe(1200);
			}
		});

		it("decodes pane_split message", () => {
			const raw = {type: "pane_split", paneId: "pty-1", orientation: "horizontal", cols: 80, rows: 24};
			const result = S.decodeUnknownSync(ClientMessage)(raw);
			expect(result.type).toBe("pane_split");
		});

		it("decodes session_create message", () => {
			const raw = {type: "session_create", name: "dev"};
			const result = S.decodeUnknownSync(ClientMessage)(raw);
			expect(result.type).toBe("session_create");
			if (result.type === "session_create") {
				expect(result.name).toBe("dev");
			}
		});

		it("decodes pane_resize message with explicit paneId", () => {
			const raw = {type: "pane_resize", paneId: "win-abc", cols: 120, rows: 40};
			const result = S.decodeUnknownSync(ClientMessage)(raw);
			expect(result.type).toBe("pane_resize");
			if (result.type === "pane_resize") {
				expect(result.paneId).toBe("win-abc");
			}
		});

		it("rejects unknown message type", () => {
			const raw = {type: "bogus"};
			expect(() => S.decodeUnknownSync(ClientMessage)(raw)).toThrow();
		});
	});

	describe("ServerMessage", () => {
		it("decodes state message", () => {
			const raw = {
				type: "state",
				sessions: [],
				tabs: [],
				activeTab: null,
				channels: {},
			};
			const result = S.decodeUnknownSync(ServerMessage)(raw);
			expect(result.type).toBe("state");
		});

		it("decodes session_exit message", () => {
			const raw = {
				type: "session_exit",
				sessionId: "s1",
				ptyId: "pty-1",
				channel: 0,
				exitCode: 0,
			};
			const result = S.decodeUnknownSync(ServerMessage)(raw);
			expect(result.type).toBe("session_exit");
		});
	});

	describe("Binary framing", () => {
		it("roundtrips binary frame", () => {
			const payload = new TextEncoder().encode("hello");
			const frame = encodeBinaryFrame(3, payload);
			const parsed = parseBinaryFrame(frame);
			expect(parsed.channel).toBe(3);
			expect(new TextDecoder().decode(parsed.payload)).toBe("hello");
		});

		it("encodes control channel as 255", () => {
			const payload = new TextEncoder().encode("{}");
			const frame = encodeBinaryFrame(CONTROL_CHANNEL, payload);
			expect(frame[0]).toBe(255);
		});
	});
});
