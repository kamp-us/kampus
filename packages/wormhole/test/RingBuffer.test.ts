import {describe, expect, test} from "vitest"
import {RingBuffer} from "../src/RingBuffer.ts"

describe("RingBuffer", () => {
	test("push and snapshot returns entries in order", () => {
		const buf = new RingBuffer(1024)
		buf.push("hello")
		buf.push(" world")
		expect(buf.snapshot()).toEqual(["hello", " world"])
	})

	test("snapshot does not clear the buffer", () => {
		const buf = new RingBuffer(1024)
		buf.push("data")
		expect(buf.snapshot()).toEqual(["data"])
		expect(buf.snapshot()).toEqual(["data"])
		expect(buf.size).toBe(4)
	})

	test("size tracks total byte count", () => {
		const buf = new RingBuffer(1024)
		buf.push("abc") // 3 bytes
		buf.push("de") // 2 bytes
		expect(buf.size).toBe(5)
	})

	test("evicts oldest entries when over capacity", () => {
		const buf = new RingBuffer(10) // 10 byte capacity
		buf.push("aaaa") // 4 bytes
		buf.push("bbbb") // 4 bytes → total 8
		buf.push("cccc") // 4 bytes → total 12, evict "aaaa" → 8

		expect(buf.snapshot()).toEqual(["bbbb", "cccc"])
	})

	test("evicts multiple entries if needed", () => {
		const buf = new RingBuffer(10)
		buf.push("aa") // 2
		buf.push("bb") // 2 → 4
		buf.push("cc") // 2 → 6
		buf.push("dddddddd") // 8 → 14, evict "aa"(12), "bb"(10) → 10

		expect(buf.snapshot()).toEqual(["cc", "dddddddd"])
	})

	test("single entry larger than capacity is truncated to tail", () => {
		const buf = new RingBuffer(5)
		buf.push("abcdefghij") // 10 bytes, capacity 5

		expect(buf.snapshot()).toEqual(["fghij"])
	})

	test("handles multi-byte characters correctly", () => {
		const buf = new RingBuffer(10)
		const emoji = "😀" // 4 bytes in UTF-8
		buf.push(emoji)
		expect(buf.size).toBe(4)

		buf.push(emoji) // 8 total
		expect(buf.size).toBe(8)

		buf.push("aaa") // 11 total → evict first emoji → 7
		expect(buf.size).toBe(7)
		expect(buf.snapshot()).toEqual([emoji, "aaa"])
	})

	test("empty buffer snapshot returns empty array", () => {
		const buf = new RingBuffer(100)
		expect(buf.snapshot()).toEqual([])
	})

	test("snapshot returns a copy, not a reference", () => {
		const buf = new RingBuffer(1024)
		buf.push("hello")
		const snap1 = buf.snapshot()
		buf.push(" world")
		const snap2 = buf.snapshot()

		expect(snap1).toEqual(["hello"])
		expect(snap2).toEqual(["hello", " world"])
	})
})
