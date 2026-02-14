import {it} from "@effect/vitest";
import {Effect} from "effect";
import {describe, expect, test} from "vitest";

import {ChannelExhaustedError, PtySpawnError, SessionNotFoundError} from "../src/Errors.ts";

describe("PtySpawnError", () => {
	test("is a tagged error with _tag PtySpawnError", () => {
		const error = new PtySpawnError({shell: "/bin/bash", cause: new Error("boom")});
		expect(error._tag).toBe("PtySpawnError");
		expect(error.shell).toBe("/bin/bash");
	});

	it.effect("is catchable by tag", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(
				new PtySpawnError({shell: "/bin/sh", cause: new Error("x")}),
			).pipe(Effect.catchTag("PtySpawnError", (e) => Effect.succeed(e.shell)));
			expect(result).toBe("/bin/sh");
		}),
	);
});

describe("SessionNotFoundError", () => {
	test("is a tagged error with _tag SessionNotFoundError", () => {
		const error = new SessionNotFoundError({sessionId: "abc-123"});
		expect(error._tag).toBe("SessionNotFoundError");
		expect(error.sessionId).toBe("abc-123");
	});

	it.effect("is catchable by tag", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(new SessionNotFoundError({sessionId: "xyz"})).pipe(
				Effect.catchTag("SessionNotFoundError", (e) => Effect.succeed(e.sessionId)),
			);
			expect(result).toBe("xyz");
		}),
	);
});

describe("ChannelExhaustedError", () => {
	test("is tagged", () => {
		const err = new ChannelExhaustedError({maxChannels: 255});
		expect(err._tag).toBe("ChannelExhaustedError");
		expect(err.maxChannels).toBe(255);
	});
});
