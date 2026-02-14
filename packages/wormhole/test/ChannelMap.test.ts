import {it} from "@effect/vitest";
import {Effect, Option} from "effect";
import {describe, expect} from "vitest";
import {make as makeChannelMap} from "../src/internal/channelMap.ts";

describe("ChannelMap", () => {
	it.effect("assigns sequential channel numbers starting at 0", () =>
		Effect.gen(function* () {
			const map = yield* makeChannelMap();
			const ch0 = yield* map.assign("session-a");
			const ch1 = yield* map.assign("session-b");
			expect(ch0).toBe(0);
			expect(ch1).toBe(1);
		}),
	);

	it.effect("getSessionId returns assigned session", () =>
		Effect.gen(function* () {
			const map = yield* makeChannelMap();
			yield* map.assign("session-a");
			const result = map.getSessionId(0);
			expect(Option.getOrNull(result)).toBe("session-a");
		}),
	);

	it.effect("getChannel returns assigned channel", () =>
		Effect.gen(function* () {
			const map = yield* makeChannelMap();
			yield* map.assign("session-a");
			const result = map.getChannel("session-a");
			expect(Option.getOrNull(result)).toBe(0);
		}),
	);

	it.effect("release frees channel for reuse", () =>
		Effect.gen(function* () {
			const map = yield* makeChannelMap();
			const ch = yield* map.assign("session-a");
			yield* map.release(ch);
			expect(Option.isNone(map.getSessionId(ch))).toBe(true);
			// Freed channel gets reused
			const ch2 = yield* map.assign("session-b");
			expect(ch2).toBe(0);
		}),
	);

	it.effect("fails with ChannelExhaustedError when full", () =>
		Effect.gen(function* () {
			const map = yield* makeChannelMap(2); // max 2 channels for test
			yield* map.assign("a");
			yield* map.assign("b");
			const result = yield* map.assign("c").pipe(Effect.either);
			expect(result._tag).toBe("Left");
		}),
	);
});
