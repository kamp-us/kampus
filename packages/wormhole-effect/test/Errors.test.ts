import {describe, expect} from "vitest";
import {it} from "@effect/vitest";
import {Effect} from "effect";

import {PtySpawnError} from "../src/Errors.ts";

describe("PtySpawnError", () => {
	it.effect("is a tagged error with _tag PtySpawnError", () =>
		Effect.gen(function* () {
			const error = new PtySpawnError({shell: "/bin/bash", cause: new Error("boom")});
			expect(error._tag).toBe("PtySpawnError");
			expect(error.shell).toBe("/bin/bash");
		}),
	);

	it.effect("fails an Effect in the error channel with catchTag", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(
				new PtySpawnError({shell: "/bin/sh", cause: new Error("x")}),
			).pipe(
				Effect.catchTag("PtySpawnError", (e) => Effect.succeed(e.shell)),
			);
			expect(result).toBe("/bin/sh");
		}),
	);
});
