/** @internal */
import {Effect, Option} from "effect";
import {ChannelExhaustedError} from "../Errors.ts";

const DEFAULT_MAX_CHANNELS = 255; // 0–254, channel 255 reserved for control

export interface ChannelMap {
	readonly assign: (sessionId: string) => Effect.Effect<number, ChannelExhaustedError>;
	readonly release: (channel: number) => Effect.Effect<void>;
	readonly getSessionId: (channel: number) => Option.Option<string>;
	readonly getChannel: (sessionId: string) => Option.Option<number>;
}

export const make = (maxChannels: number = DEFAULT_MAX_CHANNELS): Effect.Effect<ChannelMap> =>
	Effect.sync(() => {
		const channelToSession = new Map<number, string>();
		const sessionToChannel = new Map<string, number>();
		const freeList: number[] = [];
		let nextChannel = 0;

		return {
			assign: (sessionId) =>
				Effect.gen(function* () {
					// If sessionId already has a channel, return it (idempotent)
					const existing = sessionToChannel.get(sessionId);
					if (existing !== undefined) return existing;

					// Reuse freed channel first, otherwise allocate next sequential
					let channel: number;
					if (freeList.length > 0) {
						// biome-ignore lint/style/noNonNullAssertion: length check guarantees element exists
						channel = freeList.pop()!;
					} else {
						if (nextChannel >= maxChannels) {
							return yield* new ChannelExhaustedError({maxChannels});
						}
						channel = nextChannel++;
					}
					channelToSession.set(channel, sessionId);
					sessionToChannel.set(sessionId, channel);
					return channel;
				}),

			release: (channel) =>
				Effect.sync(() => {
					const sessionId = channelToSession.get(channel);
					if (sessionId !== undefined) {
						channelToSession.delete(channel);
						sessionToChannel.delete(sessionId);
						freeList.push(channel);
					}
				}),

			getSessionId: (channel) => Option.fromNullable(channelToSession.get(channel)),
			getChannel: (sessionId) => Option.fromNullable(sessionToChannel.get(sessionId)),
		} satisfies ChannelMap;
	});
