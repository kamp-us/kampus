import type {Story, Tag} from "@kampus/library";
import {Effect, Layer} from "effect";
import {describe, expect, it} from "vitest";
import {LibraryClient} from "../src/graphql/resolvers/LibraryClient";
import {loadStory} from "../src/graphql/resolvers/StoryResolver";
import {loadTag} from "../src/graphql/resolvers/TagResolver";

/**
 * Tests for Effect RequestResolver batching behavior.
 * Verifies that multiple loadStory/loadTag calls within the same Effect tick
 * are batched into a single getBatchStory/getBatchTag RPC call.
 */

const makeStory = (id: string): Story => ({
	id,
	url: `https://example.com/${id}`,
	title: `Story ${id}`,
	description: null,
	createdAt: new Date().toISOString(),
	updatedAt: null,
	tags: [],
});

const makeTag = (id: string): Tag => ({
	id,
	name: `Tag ${id}`,
	color: "123456",
	createdAt: new Date().toISOString(),
	storyCount: 0,
});

describe("RequestResolver Batching", () => {
	describe("StoryResolver", () => {
		it("batches multiple loadStory calls into single getBatchStory RPC", async () => {
			let batchCallCount = 0;
			let lastBatchIds: readonly string[] = [];

			// Mock LibraryClient that tracks getBatchStory calls
			const mockClient = {
				getBatchStory: (params: {ids: readonly string[]}) => {
					batchCallCount++;
					lastBatchIds = params.ids;
					return Effect.succeed(params.ids.map((id) => makeStory(id)));
				},
				// Other methods not needed for this test
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			// Run 3 loadStory calls in parallel - should batch into 1 RPC call
			const result = await Effect.runPromise(
				Effect.all([loadStory("story_1"), loadStory("story_2"), loadStory("story_3")], {
					concurrency: "unbounded",
					batching: true,
				}).pipe(Effect.provide(mockLayer)),
			);

			expect(batchCallCount).toBe(1);
			expect(lastBatchIds).toEqual(["story_1", "story_2", "story_3"]);
			expect(result).toHaveLength(3);
			expect(result[0]?.id).toBe("story_1");
			expect(result[1]?.id).toBe("story_2");
			expect(result[2]?.id).toBe("story_3");
		});

		it("returns null for missing stories while preserving order", async () => {
			const mockClient = {
				getBatchStory: (params: {ids: readonly string[]}) => {
					// Return null for story_2
					return Effect.succeed(
						params.ids.map((id) => (id === "story_2" ? null : makeStory(id))),
					);
				},
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			const result = await Effect.runPromise(
				Effect.all([loadStory("story_1"), loadStory("story_2"), loadStory("story_3")]).pipe(
					Effect.provide(mockLayer),
				),
			);

			expect(result[0]?.id).toBe("story_1");
			expect(result[1]).toBeNull();
			expect(result[2]?.id).toBe("story_3");
		});

		it("makes separate RPC calls for requests in different Effect ticks", async () => {
			let batchCallCount = 0;

			const mockClient = {
				getBatchStory: (params: {ids: readonly string[]}) => {
					batchCallCount++;
					return Effect.succeed(params.ids.map((id) => makeStory(id)));
				},
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			// Sequential calls should NOT be batched
			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const a = yield* loadStory("story_1");
					const b = yield* loadStory("story_2");
					return [a, b];
				}).pipe(Effect.provide(mockLayer)),
			);

			expect(batchCallCount).toBe(2);
			expect(result[0]?.id).toBe("story_1");
			expect(result[1]?.id).toBe("story_2");
		});
	});

	describe("TagResolver", () => {
		it("batches multiple loadTag calls into single getBatchTag RPC", async () => {
			let batchCallCount = 0;
			let lastBatchIds: readonly string[] = [];

			const mockClient = {
				getBatchTag: (params: {ids: readonly string[]}) => {
					batchCallCount++;
					lastBatchIds = params.ids;
					return Effect.succeed(params.ids.map((id) => makeTag(id)));
				},
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			const result = await Effect.runPromise(
				Effect.all([loadTag("tag_1"), loadTag("tag_2"), loadTag("tag_3")], {
					concurrency: "unbounded",
					batching: true,
				}).pipe(Effect.provide(mockLayer)),
			);

			expect(batchCallCount).toBe(1);
			expect(lastBatchIds).toEqual(["tag_1", "tag_2", "tag_3"]);
			expect(result).toHaveLength(3);
			expect(result[0]?.id).toBe("tag_1");
			expect(result[1]?.id).toBe("tag_2");
			expect(result[2]?.id).toBe("tag_3");
		});

		it("returns null for missing tags while preserving order", async () => {
			const mockClient = {
				getBatchTag: (params: {ids: readonly string[]}) => {
					return Effect.succeed(params.ids.map((id) => (id === "tag_2" ? null : makeTag(id))));
				},
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			const result = await Effect.runPromise(
				Effect.all([loadTag("tag_1"), loadTag("tag_2"), loadTag("tag_3")]).pipe(
					Effect.provide(mockLayer),
				),
			);

			expect(result[0]?.id).toBe("tag_1");
			expect(result[1]).toBeNull();
			expect(result[2]?.id).toBe("tag_3");
		});
	});

	describe("Mixed batching", () => {
		it("batches story and tag requests independently", async () => {
			let storyBatchCount = 0;
			let tagBatchCount = 0;

			const mockClient = {
				getBatchStory: (params: {ids: readonly string[]}) => {
					storyBatchCount++;
					return Effect.succeed(params.ids.map((id) => makeStory(id)));
				},
				getBatchTag: (params: {ids: readonly string[]}) => {
					tagBatchCount++;
					return Effect.succeed(params.ids.map((id) => makeTag(id)));
				},
			} as unknown as LibraryClient["Type"];

			const mockLayer = Layer.succeed(LibraryClient, mockClient);

			const result = await Effect.runPromise(
				Effect.all(
					[loadStory("story_1"), loadTag("tag_1"), loadStory("story_2"), loadTag("tag_2")],
					{concurrency: "unbounded", batching: true},
				).pipe(Effect.provide(mockLayer)),
			);

			// Stories batched together, tags batched together
			expect(storyBatchCount).toBe(1);
			expect(tagBatchCount).toBe(1);
			expect(result).toHaveLength(4);
		});
	});
});
