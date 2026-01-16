import {env} from "cloudflare:test";
import {afterEach, describe, expect, it} from "vitest";
import {makeLibraryTestClient} from "./rpc-test-client";

describe("Library Stories", () => {
	const clients: ReturnType<typeof makeLibraryTestClient>[] = [];

	const getLibrary = (userId: string) => {
		const id = env.LIBRARY.idFromName(userId);
		const stub = env.LIBRARY.get(id);
		const client = makeLibraryTestClient((req) => stub.fetch(req));
		clients.push(client);
		return client;
	};

	afterEach(async () => {
		for (const client of clients) {
			await client.dispose();
		}
		clients.length = 0;
	});

	describe("Story CRUD", () => {
		it("creates a story with url and title", async () => {
			const library = getLibrary("story-user-1");
			const story = await library.createStory({
				url: "https://example.com/article",
				title: "Example Article",
			});

			expect(story.id).toMatch(/^story_/);
			expect(story.url).toBe("https://example.com/article");
			expect(story.title).toBe("Example Article");
			expect(story.createdAt).toBeDefined();
		});

		it("creates a story with description", async () => {
			const library = getLibrary("story-user-2");
			const story = await library.createStory({
				url: "https://example.com/with-desc",
				title: "With Description",
				description: "A detailed description",
			});

			expect(story.description).toBe("A detailed description");
		});

		// Note: URL validation error cases tested in library-handlers.spec.ts unit tests

		it("gets a story by id", async () => {
			const library = getLibrary("story-user-4");
			const created = await library.createStory({
				url: "https://example.com/get-test",
				title: "Get Test",
			});

			const story = await library.getStory(created.id);
			expect(story).not.toBeNull();
			expect(story?.title).toBe("Get Test");
			expect(story?.url).toBe("https://example.com/get-test");
		});

		it("returns null for non-existent story", async () => {
			const library = getLibrary("story-user-5");
			const story = await library.getStory("story_nonexistent");

			expect(story).toBeNull();
		});

		it("updates a story title", async () => {
			const library = getLibrary("story-user-6");
			const created = await library.createStory({
				url: "https://example.com/update-test",
				title: "Original Title",
			});

			const updated = await library.updateStory(created.id, {title: "Updated Title"});
			expect(updated?.title).toBe("Updated Title");
			expect(updated?.url).toBe("https://example.com/update-test");
		});

		it("returns existing story when no updates provided", async () => {
			const library = getLibrary("story-user-7");
			const created = await library.createStory({
				url: "https://example.com/no-update",
				title: "No Update",
			});

			const result = await library.updateStory(created.id, {});
			expect(result?.title).toBe("No Update");
		});

		it("returns null when updating non-existent story", async () => {
			const library = getLibrary("story-user-8");

			const result = await library.updateStory("story_nonexistent", {title: "New"});
			expect(result).toBeNull();
		});

		it("deletes a story", async () => {
			const library = getLibrary("story-user-9");
			const story = await library.createStory({
				url: "https://example.com/delete-me",
				title: "Delete Me",
			});

			const deleted = await library.deleteStory(story.id);
			expect(deleted).toBe(true);

			const fetched = await library.getStory(story.id);
			expect(fetched).toBeNull();
		});

		it("returns false when deleting non-existent story", async () => {
			const library = getLibrary("story-user-10");

			const result = await library.deleteStory("story_nonexistent");
			expect(result).toBe(false);
		});

		it("cascade deletes tag associations when story is deleted", async () => {
			const library = getLibrary("story-user-11");
			const story = await library.createStory({
				url: "https://example.com/cascade",
				title: "Cascade Test",
			});
			const tag = await library.createTag("cascade-tag", "ff0000");
			await library.tagStory(story.id, [tag.id]);

			// Verify tag is associated
			const tagsBefore = await library.getTagsForStory(story.id);
			expect(tagsBefore).toHaveLength(1);

			// Delete story
			await library.deleteStory(story.id);

			// Tag should still exist, but no stories should have it
			const storiesWithTag = await library.getStoriesByTag(tag.id);
			expect(storiesWithTag).toHaveLength(0);
		});
	});

	describe("Story Listing and Pagination", () => {
		it("lists stories ordered by id descending (newest first)", async () => {
			const library = getLibrary("story-user-20");
			await library.createStory({url: "https://example.com/1", title: "First"});
			await library.createStory({url: "https://example.com/2", title: "Second"});
			await library.createStory({url: "https://example.com/3", title: "Third"});

			const result = await library.listStories({first: 10});

			expect(result.edges).toHaveLength(3);
			expect(result.edges[0].title).toBe("Third");
			expect(result.edges[1].title).toBe("Second");
			expect(result.edges[2].title).toBe("First");
		});

		it("returns empty list for user with no stories", async () => {
			const library = getLibrary("story-user-21");

			const result = await library.listStories({first: 10});

			expect(result.edges).toHaveLength(0);
			expect(result.hasNextPage).toBe(false);
			expect(result.endCursor).toBeNull();
		});

		it("limits results to requested count", async () => {
			const library = getLibrary("story-user-22");
			for (let i = 0; i < 5; i++) {
				await library.createStory({url: `https://example.com/${i}`, title: `Story ${i}`});
			}

			const result = await library.listStories({first: 3});

			expect(result.edges).toHaveLength(3);
			expect(result.hasNextPage).toBe(true);
		});

		it("supports cursor-based pagination", async () => {
			const library = getLibrary("story-user-23");
			for (let i = 0; i < 5; i++) {
				await library.createStory({url: `https://example.com/${i}`, title: `Story ${i}`});
			}

			// Get first page
			const page1 = await library.listStories({first: 2});
			expect(page1.edges).toHaveLength(2);
			expect(page1.hasNextPage).toBe(true);
			expect(page1.endCursor).not.toBeNull();

			// Get second page using cursor
			const page2 = await library.listStories({first: 2, after: page1.endCursor ?? undefined});
			expect(page2.edges).toHaveLength(2);
			expect(page2.hasNextPage).toBe(true);

			// Get third page
			const page3 = await library.listStories({first: 2, after: page2.endCursor ?? undefined});
			expect(page3.edges).toHaveLength(1);
			expect(page3.hasNextPage).toBe(false);
		});

		it("uses default limit of 20 when not specified", async () => {
			const library = getLibrary("story-user-24");
			for (let i = 0; i < 25; i++) {
				await library.createStory({url: `https://example.com/${i}`, title: `Story ${i}`});
			}

			const result = await library.listStories();

			expect(result.edges).toHaveLength(20);
			expect(result.hasNextPage).toBe(true);
		});
	});
});
