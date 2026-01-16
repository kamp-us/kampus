import {SqlClient} from "@effect/sql";
import {InvalidUrlError} from "@kampus/library";
import {Cause, Effect, Exit, Layer} from "effect";
import {describe, expect, it} from "vitest";
import {handlers} from "../src/features/library/handlers";

/**
 * Unit tests for Library handlers using mock SqlClient.
 * Tests handler logic in isolation without DO infrastructure.
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
	describe("getStory", () => {
		it("returns null for non-existent story", async () => {
			const mockLayer = makeMockSqlClient([{pattern: /SELECT \* FROM story WHERE id/, result: []}]);

			const result = await Effect.runPromise(
				handlers.getStory({id: "story_nonexistent"}).pipe(Effect.provide(mockLayer)),
			);

			expect(result).toBeNull();
		});

		it("returns story with tags when found", async () => {
			const storyRow = {
				id: "story_123",
				url: "https://example.com/test",
				title: "Test Story",
				description: "A test description",
				createdAt: Date.now(),
			};

			const tagJoinRows = [
				{storyId: "story_123", tagId: "tag_1", tagName: "javascript", tagColor: "#f7df1e"},
				{storyId: "story_123", tagId: "tag_2", tagName: "typescript", tagColor: "#3178c6"},
			];

			const mockLayer = makeMockSqlClient([
				{pattern: /SELECT \* FROM story WHERE id/, result: [storyRow]},
				// getTagsForStoriesSimple uses sql.unsafe with story_id IN ('story_123')
				{pattern: /story_id IN.*'story_123'/, result: tagJoinRows},
			]);

			const result = await Effect.runPromise(
				handlers.getStory({id: "story_123"}).pipe(Effect.provide(mockLayer)),
			);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("story_123");
			expect(result?.title).toBe("Test Story");
			expect(result?.tags).toHaveLength(2);
			expect(result?.tags[0].name).toBe("javascript");
			expect(result?.tags[1].name).toBe("typescript");
		});

		it("returns story with empty tags array when no tags", async () => {
			const storyRow = {
				id: "story_456",
				url: "https://example.com/no-tags",
				title: "No Tags Story",
				description: null,
				createdAt: Date.now(),
			};

			const mockLayer = makeMockSqlClient([
				{pattern: /SELECT \* FROM story WHERE id/, result: [storyRow]},
				{pattern: /SELECT st\.story_id.*FROM story_tag/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers.getStory({id: "story_456"}).pipe(Effect.provide(mockLayer)),
			);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("story_456");
			expect(result?.tags).toEqual([]);
		});
	});

	describe("createStory", () => {
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

		it("creates story with valid URL", async () => {
			const mockLayer = makeMockSqlClient([
				{pattern: /INSERT INTO story/, result: []},
				{pattern: /SELECT st\.story_id.*FROM story_tag/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers
					.createStory({url: "https://example.com/article", title: "Test Article"})
					.pipe(Effect.provide(mockLayer)),
			);

			expect(result.id).toMatch(/^story_/);
			expect(result.url).toBe("https://example.com/article");
			expect(result.title).toBe("Test Article");
			expect(result.description).toBeNull();
			expect(result.tags).toEqual([]);
		});

		it("creates story with description", async () => {
			const mockLayer = makeMockSqlClient([
				{pattern: /INSERT INTO story/, result: []},
				{pattern: /SELECT st\.story_id.*FROM story_tag/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers
					.createStory({
						url: "https://example.com/with-desc",
						title: "With Description",
						description: "A detailed description",
					})
					.pipe(Effect.provide(mockLayer)),
			);

			expect(result.description).toBe("A detailed description");
		});

		it("creates story and links tags when tagIds provided", async () => {
			// Track what INSERT queries were executed
			const insertedStoryTags: string[] = [];

			// Custom mock that captures story_tag inserts via template values
			const sql = Object.assign(
				<T>(_strings: TemplateStringsArray, ..._values: unknown[]): Effect.Effect<T[]> => {
					const template = _strings.join("?");
					if (/INSERT OR IGNORE INTO story_tag/.test(template)) {
						// Values are [storyId, tagId] - capture the tagId (second value)
						if (_values.length >= 2) {
							insertedStoryTags.push(_values[1] as string);
						}
					}
					return Effect.succeed([] as T[]);
				},
				{
					unsafe: <T>(query: string): Effect.Effect<T[]> => {
						if (/SELECT id FROM tag WHERE id IN/.test(query)) {
							return Effect.succeed([{id: "tag_1"}, {id: "tag_2"}] as T[]);
						}
						return Effect.succeed([] as T[]);
					},
					literal: (s: string) => s,
					withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
				},
			);

			const mockLayer = Layer.succeed(SqlClient.SqlClient, sql as unknown as SqlClient.SqlClient);

			const result = await Effect.runPromise(
				handlers
					.createStory({
						url: "https://example.com/tagged",
						title: "Tagged Story",
						tagIds: ["tag_1", "tag_2"],
					})
					.pipe(Effect.provide(mockLayer)),
			);

			// Verify story was created
			expect(result.id).toMatch(/^story_/);
			expect(result.title).toBe("Tagged Story");

			// Verify both tags were linked via INSERT statements
			expect(insertedStoryTags).toContain("tag_1");
			expect(insertedStoryTags).toContain("tag_2");
		});
	});

	describe("deleteStory", () => {
		it("returns deleted false for non-existent story", async () => {
			const mockLayer = makeMockSqlClient([{pattern: /SELECT \* FROM story WHERE id/, result: []}]);

			const result = await Effect.runPromise(
				handlers.deleteStory({id: "story_nonexistent"}).pipe(Effect.provide(mockLayer)),
			);

			expect(result.deleted).toBe(false);
		});

		it("returns deleted true for existing story", async () => {
			const storyRow = {
				id: "story_to_delete",
				url: "https://example.com/delete",
				title: "Delete Me",
				description: null,
				createdAt: Date.now(),
			};

			const mockLayer = makeMockSqlClient([
				{pattern: /SELECT \* FROM story WHERE id/, result: [storyRow]},
				{pattern: /DELETE FROM story_tag/, result: []},
				{pattern: /DELETE FROM story WHERE/, result: []},
			]);

			const result = await Effect.runPromise(
				handlers.deleteStory({id: "story_to_delete"}).pipe(Effect.provide(mockLayer)),
			);

			expect(result.deleted).toBe(true);
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
