import {describe, expect, test} from "vitest";
import {RingBuffer} from "../src/RingBuffer.ts";

describe("RingBuffer", () => {
	test("push and snapshot returns entries in order", () => {
		const buf = new RingBuffer(1024);
		buf.push("hello");
		buf.push(" world");
		expect(buf.snapshot()).toEqual(["hello", " world"]);
	});

	test("snapshot does not clear the buffer", () => {
		const buf = new RingBuffer(1024);
		buf.push("data");
		expect(buf.snapshot()).toEqual(["data"]);
		expect(buf.snapshot()).toEqual(["data"]);
		expect(buf.size).toBe(4);
	});

	test("size tracks total byte count", () => {
		const buf = new RingBuffer(1024);
		buf.push("abc");
		buf.push("de");
		expect(buf.size).toBe(5);
	});

	test("evicts oldest entries when over capacity", () => {
		const buf = new RingBuffer(10);
		buf.push("aaaa");
		buf.push("bbbb");
		buf.push("cccc");
		expect(buf.snapshot()).toEqual(["bbbb", "cccc"]);
	});

	test("evicts multiple entries if needed", () => {
		const buf = new RingBuffer(10);
		buf.push("aa");
		buf.push("bb");
		buf.push("cc");
		buf.push("dddddddd");
		expect(buf.snapshot()).toEqual(["cc", "dddddddd"]);
	});

	test("single entry larger than capacity is truncated to tail", () => {
		const buf = new RingBuffer(5);
		buf.push("abcdefghij");
		expect(buf.snapshot()).toEqual(["fghij"]);
	});

	test("handles multi-byte characters correctly", () => {
		const buf = new RingBuffer(10);
		const emoji = "😀";
		buf.push(emoji);
		expect(buf.size).toBe(4);
		buf.push(emoji);
		expect(buf.size).toBe(8);
		buf.push("aaa");
		expect(buf.size).toBe(7);
		expect(buf.snapshot()).toEqual([emoji, "aaa"]);
	});

	test("empty buffer snapshot returns empty array", () => {
		const buf = new RingBuffer(100);
		expect(buf.snapshot()).toEqual([]);
	});

	test("snapshot returns a copy, not a reference", () => {
		const buf = new RingBuffer(1024);
		buf.push("hello");
		const snap1 = buf.snapshot();
		buf.push(" world");
		const snap2 = buf.snapshot();
		expect(snap1).toEqual(["hello"]);
		expect(snap2).toEqual(["hello", " world"]);
	});

	describe("serialize / fromSnapshot", () => {
		test("round-trip preserves entries, totalBytes, and capacity", () => {
			const buf = new RingBuffer(1024);
			buf.push("hello");
			buf.push(" world");

			const serialized = buf.serialize();
			const restored = RingBuffer.fromSnapshot(serialized);

			expect(restored.snapshot()).toEqual(buf.snapshot());
			expect(restored.size).toBe(buf.size);
			expect(restored.capacity).toBe(buf.capacity);
			expect(restored.serialize()).toEqual(serialized);
		});

		test("round-trip on empty buffer", () => {
			const buf = new RingBuffer(256);
			const serialized = buf.serialize();

			expect(serialized).toEqual({ entries: [], totalBytes: 0, capacity: 256 });

			const restored = RingBuffer.fromSnapshot(serialized);
			expect(restored.snapshot()).toEqual([]);
			expect(restored.size).toBe(0);
			expect(restored.capacity).toBe(256);
		});

		test("round-trip on buffer at capacity", () => {
			const buf = new RingBuffer(10);
			buf.push("aaaa");
			buf.push("bbbb");
			buf.push("cccc"); // evicts "aaaa", total = 8

			const serialized = buf.serialize();
			expect(serialized.entries).toEqual(["bbbb", "cccc"]);
			expect(serialized.totalBytes).toBe(8);
			expect(serialized.capacity).toBe(10);

			const restored = RingBuffer.fromSnapshot(serialized);
			expect(restored.snapshot()).toEqual(["bbbb", "cccc"]);
			expect(restored.size).toBe(8);
			expect(restored.capacity).toBe(10);

			// restored buffer should continue working correctly
			restored.push("ee");
			expect(restored.snapshot()).toEqual(["bbbb", "cccc", "ee"]);
			expect(restored.size).toBe(10);
		});

		test("serialize returns copies, not references", () => {
			const buf = new RingBuffer(1024);
			buf.push("data");
			const s1 = buf.serialize();
			buf.push("more");
			const s2 = buf.serialize();

			expect(s1.entries).toEqual(["data"]);
			expect(s2.entries).toEqual(["data", "more"]);
		});

		test("fromSnapshot does not alias the input array", () => {
			const data = { entries: ["a", "b"], totalBytes: 2, capacity: 100 };
			const restored = RingBuffer.fromSnapshot(data);
			data.entries.push("c");
			expect(restored.snapshot()).toEqual(["a", "b"]);
		});
	});
});
