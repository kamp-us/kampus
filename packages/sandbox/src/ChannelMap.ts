const DEFAULT_MAX_CHANNELS = 255; // 0-254, channel 255 reserved for control

export class ChannelMap {
	private channelToPty = new Map<number, string>();
	private ptyToChannel = new Map<string, number>();
	private freeList: number[] = [];
	private nextChannel = 0;
	private maxChannels: number;

	constructor(maxChannels: number = DEFAULT_MAX_CHANNELS) {
		this.maxChannels = maxChannels;
	}

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

	release(channel: number): void {
		const ptyId = this.channelToPty.get(channel);
		if (ptyId === undefined) return;
		this.channelToPty.delete(channel);
		this.ptyToChannel.delete(ptyId);
		this.freeList.push(channel);
	}

	getPtyId(channel: number): string | null {
		return this.channelToPty.get(channel) ?? null;
	}

	getChannel(ptyId: string): number | null {
		return this.ptyToChannel.get(ptyId) ?? null;
	}

	toRecord(): Record<string, number> {
		const record: Record<string, number> = {};
		for (const [ptyId, channel] of this.ptyToChannel) {
			record[ptyId] = channel;
		}
		return record;
	}

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
