/**
 * RingBuffer — fixed-capacity circular buffer for PTY output.
 *
 * Stores strings up to `capacity` total bytes. When a push exceeds capacity,
 * oldest entries are evicted until the new entry fits. This ensures bounded
 * memory usage for buffered terminal output during WebSocket disconnects.
 */
export class RingBuffer {
  private entries: string[] = [];
  private totalBytes = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  /** Append data, evicting oldest entries if total bytes exceed capacity. */
  push(data: string): void {
    const len = Buffer.byteLength(data);

    // If a single entry exceeds capacity, store only the tail that fits.
    if (len > this.capacity) {
      this.entries = [data.slice(-this.capacity)];
      this.totalBytes = Buffer.byteLength(this.entries[0]);
      return;
    }

    this.entries.push(data);
    this.totalBytes += len;

    while (this.totalBytes > this.capacity && this.entries.length > 1) {
      const evicted = this.entries.shift()!;
      this.totalBytes -= Buffer.byteLength(evicted);
    }
  }

  /** Return a copy of all buffered entries without clearing. */
  snapshot(): string[] {
    return this.entries.slice();
  }

  /** Current buffered byte count. */
  get size(): number {
    return this.totalBytes;
  }
}
