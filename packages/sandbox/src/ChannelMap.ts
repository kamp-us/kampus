/**
 * @module
 *
 * Bidirectional map between PTY IDs and single-byte channel numbers (0–254).
 * Channel 255 is reserved for control messages (see {@link Protocol}).
 * The 255-channel limit comes from the binary frame format: one byte per channel.
 */

const DEFAULT_MAX_CHANNELS = 255; // 0-254, channel 255 reserved for control

/**
 * Bidirectional map from PTY IDs (strings) to channel numbers (0–254).
 *
 * Channels are assigned sequentially, and released channels are recycled
 * via a free-list so IDs stay compact.
 */
export class ChannelMap {
	private channelToPty = new Map<number, string>();
	private ptyToChannel = new Map<string, number>();
	private freeList: number[] = [];
	private nextChannel = 0;
	private maxChannels: number;

	constructor(maxChannels: number = DEFAULT_MAX_CHANNELS) {
		this.maxChannels = maxChannels;
	}

	/** Assign a channel to `ptyId`. Idempotent — returns the existing channel if already assigned. Returns `null` when all channels are exhausted. */
	assign(ptyId: string): number | null {
		const existing = this.ptyToChannel.get(ptyId);
		if (existing !== undefined) return existing;

		let channel: number | undefined;
		if (this.freeList.length > 0) {
			channel = this.freeList.pop()!;
		} else if (this.nextChannel < this.maxChannels) {
			channel = this.nextChannel++;
		} else {
			return null;
		}

		this.channelToPty.set(channel, ptyId);
		this.ptyToChannel.set(ptyId, channel);
		return channel;
	}

	/** Release a channel, returning it to the free-list for reuse. No-op if the channel is unassigned. */
	release(channel: number): void {
		const ptyId = this.channelToPty.get(channel);
		if (ptyId === undefined) return;
		this.channelToPty.delete(channel);
		this.ptyToChannel.delete(ptyId);
		this.freeList.push(channel);
	}

	/** Look up the PTY ID for a channel, or `null` if unassigned. */
	getPtyId(channel: number): string | null {
		return this.channelToPty.get(channel) ?? null;
	}

	/** Look up the channel for a PTY ID, or `null` if unassigned. */
	getChannel(ptyId: string): number | null {
		return this.ptyToChannel.get(ptyId) ?? null;
	}

	/** Serialize to a plain object (`{ ptyId: channel }`) for persistence. */
	toRecord(): Record<string, number> {
		const record: Record<string, number> = {};
		for (const [ptyId, channel] of this.ptyToChannel) {
			record[ptyId] = channel;
		}
		return record;
	}

	/** Reconstruct from a serialized record. Sets `nextChannel` past the highest seen value; does not rebuild the free-list (gaps become permanently lost). */
	static fromRecord(
		record: Record<string, number>,
		maxChannels: number = DEFAULT_MAX_CHANNELS,
	): ChannelMap {
		const map = new ChannelMap(maxChannels);
		let maxSeen = -1;
		for (const [ptyId, channel] of Object.entries(record)) {
			map.channelToPty.set(channel, ptyId);
			map.ptyToChannel.set(ptyId, channel);
			if (channel > maxSeen) maxSeen = channel;
		}
		map.nextChannel = maxSeen + 1;
		return map;
	}
}
