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

	describe("listStories", () => {
		it("returns empty list when no stories", async () => {
			const mockLayer = makeMockSqlClient([
				{pattern: /SELECT COUNT/, result: [{count: 0}]},
				{pattern: /SELECT \* FROM story ORDER BY/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers.listStories({}).pipe(Effect.provide(mockLayer)),
			);

			expect(result.stories).toHaveLength(0);
			expect(result.hasNextPage).toBe(false);
			expect(result.totalCount).toBe(0);
		});

		it("returns stories with pagination info", async () => {
			const stories = [
				{id: "story_3", url: "https://a.com", title: "Third", description: null, createdAt: 3},
				{id: "story_2", url: "https://b.com", title: "Second", description: null, createdAt: 2},
			];

			const mockLayer = makeMockSqlClient([
				{pattern: /SELECT COUNT/, result: [{count: 5}]},
				{pattern: /SELECT \* FROM story ORDER BY/, result: stories},
				{pattern: /SELECT st\.story_id.*FROM story_tag/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers.listStories({first: 2}).pipe(Effect.provide(mockLayer)),
			);

			expect(result.stories).toHaveLength(2);
			expect(result.totalCount).toBe(5);
		});
	});
});
