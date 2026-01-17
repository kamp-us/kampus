import {SqlClient} from "@effect/sql";
import {InvalidUrlError} from "@kampus/library";
import {Cause, Effect, Exit, Layer} from "effect";
import {describe, expect, it} from "vitest";
import {handlers} from "../src/features/library/handlers";

/**
 * Unit tests for Library handlers using mock SqlClient.
 * Tests pure handler logic (validation, etc.) in isolation.
 *
 * Note: Handlers using StoryRepo/TagRepo are tested via integration tests
 * in library-stories.spec.ts and library-tags.spec.ts, as the repo pattern
 * requires a complete SqlClient implementation.
 */

// Mock query result storage
type MockQueryResult = unknown[];
type MockQuerySetup = {pattern: RegExp; result: MockQueryResult};

const makeMockSqlClient = (querySetups: MockQuerySetup[]) => {
	// Create mock sql template function
	const sql = Object.assign(
		<T>(_strings: TemplateStringsArray, ..._values: unknown[]): Effect.Effect<T[]> => {
			const query = _strings.reduce((acc, str, i) => acc + str + (_values[i] ?? ""), "");
			for (const setup of querySetups) {
				if (setup.pattern.test(query)) {
					return Effect.succeed(setup.result as T[]);
				}
			}
			return Effect.succeed([] as T[]);
		},
		{
			unsafe: <T>(query: string): Effect.Effect<T[]> => {
				for (const setup of querySetups) {
					if (setup.pattern.test(query)) {
						return Effect.succeed(setup.result as T[]);
					}
				}
				return Effect.succeed([] as T[]);
			},
			literal: (s: string) => s,
			withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
		},
	);

	return Layer.succeed(SqlClient.SqlClient, sql as unknown as SqlClient.SqlClient);
};

describe("Library Handlers Unit Tests", () => {
	describe("createStory - URL validation", () => {
		it("fails with InvalidUrlError for invalid URL format", async () => {
			const mockLayer = makeMockSqlClient([]);

			const exit = await Effect.runPromiseExit(
				handlers
					.createStory({url: "not-a-valid-url", title: "Test"})
					.pipe(Effect.provide(mockLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(InvalidUrlError);
					expect((error.value as InvalidUrlError).url).toBe("not-a-valid-url");
				}
			}
		});

		it("fails with InvalidUrlError for URL without protocol", async () => {
			const mockLayer = makeMockSqlClient([]);

			const exit = await Effect.runPromiseExit(
				handlers
					.createStory({url: "example.com/path", title: "Test"})
					.pipe(Effect.provide(mockLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(InvalidUrlError);
				}
			}
		});
	});

	// Note: listStories unit tests removed - now uses SqliteDrizzle and is
	// comprehensively tested via integration tests in library-stories.spec.ts
});
