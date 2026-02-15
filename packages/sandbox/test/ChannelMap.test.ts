import {describe, it, expect} from "vitest";
import {ChannelMap} from "../src/ChannelMap.ts";

describe("ChannelMap", () => {
	it("assigns sequential channels", () => {
		const map = new ChannelMap();
		expect(map.assign("pty-1")).toBe(0);
		expect(map.assign("pty-2")).toBe(1);
		expect(map.assign("pty-3")).toBe(2);
	});

	it("returns existing channel for same ptyId (idempotent)", () => {
		const map = new ChannelMap();
		const ch = map.assign("pty-1");
		expect(map.assign("pty-1")).toBe(ch);
	});

	it("recycles released channels", () => {
		const map = new ChannelMap();
		map.assign("pty-1"); // 0
		const ch1 = map.assign("pty-2"); // 1
		map.release(ch1!);
		const ch2 = map.assign("pty-3");
		expect(ch2).toBe(1); // recycled
	});

	it("looks up by channel", () => {
		const map = new ChannelMap();
		map.assign("pty-1");
		expect(map.getPtyId(0)).toBe("pty-1");
		expect(map.getPtyId(99)).toBeNull();
	});

	it("looks up by ptyId", () => {
		const map = new ChannelMap();
		map.assign("pty-1");
		expect(map.getChannel("pty-1")).toBe(0);
		expect(map.getChannel("nonexistent")).toBeNull();
	});

	it("returns null when channels exhausted", () => {
		const map = new ChannelMap(3); // max 3 channels
		map.assign("a");
		map.assign("b");
		map.assign("c");
		expect(map.assign("d")).toBeNull();
	});

	it("serializes to a plain record", () => {
		const map = new ChannelMap();
		map.assign("pty-1");
		map.assign("pty-2");
		const record = map.toRecord();
		expect(record).toEqual({"pty-1": 0, "pty-2": 1});
	});

	it("restores from a record", () => {
		const map = ChannelMap.fromRecord({"pty-1": 0, "pty-2": 3});
		expect(map.getChannel("pty-1")).toBe(0);
		expect(map.getChannel("pty-2")).toBe(3);
		// next assign should not collide
		const ch = map.assign("pty-3");
		expect(ch).not.toBe(0);
		expect(ch).not.toBe(3);
	});
});
