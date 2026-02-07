import {beforeEach, describe, expect, test, vi} from "vitest";
import {createMockPty, mockPtyState, resetPtyMock} from "./mocks/node-pty.ts";
import {PtySession} from "../src/pty-session.ts";

vi.mock("@lydell/node-pty", () => createMockPty());

describe("PtySession multi-client", () => {
	let session: PtySession;

	beforeEach(() => {
		resetPtyMock();
		session = new PtySession({id: "test-session", cols: 80, rows: 24, bufferCapacity: 100 * 1024});
	});

	test("broadcasts output to all attached clients", () => {
		const received1: string[] = [];
		const received2: string[] = [];

		session.attach("c1", (d) => received1.push(d), () => {}, 80, 24);
		session.attach("c2", (d) => received2.push(d), () => {}, 80, 24);

		mockPtyState.dataCb?.("hello");

		expect(received1).toEqual(["hello"]);
		expect(received2).toEqual(["hello"]);
	});

	test("detaching one client does not affect the other", () => {
		const received1: string[] = [];
		const received2: string[] = [];

		session.attach("c1", (d) => received1.push(d), () => {}, 80, 24);
		session.attach("c2", (d) => received2.push(d), () => {}, 80, 24);

		session.detach("c1");
		mockPtyState.dataCb?.("after-detach");

		expect(received1).toEqual([]);
		expect(received2).toEqual(["after-detach"]);
	});

	test("new client gets ring buffer replay on attach", () => {
		session.attach("c1", () => {}, () => {}, 80, 24);
		mockPtyState.dataCb?.("line1");
		mockPtyState.dataCb?.("line2");

		// Second client joins — gets replayed history
		const received: string[] = [];
		session.attach("c2", (d) => received.push(d), () => {}, 80, 24);

		expect(received).toEqual(["line1", "line2"]);
	});

	test("clientCount reflects connected client count", () => {
		expect(session.clientCount).toBe(0);

		session.attach("c1", () => {}, () => {}, 80, 24);
		expect(session.clientCount).toBe(1);

		session.attach("c2", () => {}, () => {}, 80, 24);
		expect(session.clientCount).toBe(2);

		session.detach("c1");
		expect(session.clientCount).toBe(1);

		session.detach("c2");
		expect(session.clientCount).toBe(0);
	});

	test("PTY size is min(cols) × min(rows) across clients", () => {
		session.attach("c1", () => {}, () => {}, 120, 40);
		// recomputeSize called on attach — single client, uses its size
		expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 120, rows: 40});

		session.attach("c2", () => {}, () => {}, 80, 24);
		// Now min is 80×24
		expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 80, rows: 24});
	});

	test("PTY size recomputes when a smaller client detaches", () => {
		session.attach("c1", () => {}, () => {}, 120, 40);
		session.attach("c2", () => {}, () => {}, 80, 24);

		session.detach("c2"); // smaller client leaves
		// Remaining client is 120×40
		expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 120, rows: 40});
	});

	test("clientResize updates size computation", () => {
		session.attach("c1", () => {}, () => {}, 120, 40);
		session.attach("c2", () => {}, () => {}, 100, 30);

		session.clientResize("c2", 60, 20);
		expect(mockPtyState.resizeCalls.at(-1)).toEqual({cols: 60, rows: 20});
	});

	test("onExit broadcasts to all clients", () => {
		const exits1: number[] = [];
		const exits2: number[] = [];

		session.attach("c1", () => {}, (code) => exits1.push(code), 80, 24);
		session.attach("c2", () => {}, (code) => exits2.push(code), 80, 24);

		mockPtyState.exitCb?.({exitCode: 0});

		expect(exits1).toEqual([0]);
		expect(exits2).toEqual([0]);
	});
});
