/**
 * Byte-capped ring buffer that evicts oldest entries when capacity is exceeded.
 *
 * @since 0.0.1
 * @category models
 */
export class RingBuffer {
	private entries: string[] = [];
	private totalBytes = 0;

	/** Maximum byte capacity. */
	readonly capacity: number;

	constructor(capacity: number) {
		this.capacity = capacity;
	}

	/**
	 * Push a string into the buffer, evicting oldest entries if the total exceeds capacity.
	 * A single entry larger than capacity is truncated to its tail.
	 *
	 * @since 0.0.1
	 */
	push(data: string): void {
		const len = Buffer.byteLength(data);
		if (len > this.capacity) {
			const buf = Buffer.from(data);
			const truncated = buf.subarray(buf.length - this.capacity).toString("utf-8");
			this.entries = [truncated];
			this.totalBytes = Buffer.byteLength(truncated);
			return;
		}
		this.entries.push(data);
		this.totalBytes += len;
		while (this.totalBytes > this.capacity && this.entries.length > 1) {
			const evicted = this.entries.shift();
			if (evicted === undefined) break;
			this.totalBytes -= Buffer.byteLength(evicted);
		}
	}

	/**
	 * Return a shallow copy of all buffered entries in insertion order.
	 *
	 * @since 0.0.1
	 */
	snapshot(): string[] {
		return this.entries.slice();
	}

	/**
	 * Current total byte size of all buffered entries.
	 *
	 * @since 0.0.1
	 */
	get size(): number {
		return this.totalBytes;
	}
}
