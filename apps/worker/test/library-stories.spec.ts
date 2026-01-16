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

		it("creates a story with tags", async () => {
			const library = getLibrary("story-user-create-tags");
			const tag1 = await library.createTag("react", "61dafb");
			const tag2 = await library.createTag("typescript", "3178c6");

			const story = await library.createStory({
				url: "https://example.com/with-tags",
				title: "Story With Tags",
				tagIds: [tag1.id, tag2.id],
			});

			expect(story.tags).toHaveLength(2);
			expect(story.tags.map((t) => t.name).sort()).toEqual(["react", "typescript"]);
		});

		it("creates story with non-existent tagIds (silently ignores)", async () => {
			const library = getLibrary("story-user-bad-tags");
			const validTag = await library.createTag("valid", "123456");

			const story = await library.createStory({
				url: "https://example.com/mixed-tags",
				title: "Mixed Tags",
				tagIds: [validTag.id, "tag_nonexistent"],
			});

			expect(story.tags).toHaveLength(1);
			expect(story.tags[0].id).toBe(validTag.id);
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

		it("gets story with tags in correct format", async () => {
			const library = getLibrary("story-user-tags-format");
			const tag1 = await library.createTag("frontend", "ff5500");
			const tag2 = await library.createTag("backend", "0055ff");

			const created = await library.createStory({
				url: "https://example.com/with-tags",
				title: "Tags Format Test",
				tagIds: [tag1.id, tag2.id],
			});

			const story = await library.getStory(created.id);
			expect(story?.tags).toHaveLength(2);
			// Each tag has id, name, color
			for (const tag of story!.tags) {
				expect(tag).toHaveProperty("id");
				expect(tag).toHaveProperty("name");
				expect(tag).toHaveProperty("color");
			}
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

		it("updates a story description", async () => {
			const library = getLibrary("story-user-update-desc");
			const created = await library.createStory({
				url: "https://example.com/update-desc",
				title: "Update Desc",
				description: "Original",
			});

			const updated = await library.updateStory(created.id, {description: "Updated description"});
			expect(updated?.description).toBe("Updated description");
		});

		it("clears story description (set to null)", async () => {
			const library = getLibrary("story-user-clear-desc");
			const created = await library.createStory({
				url: "https://example.com/clear-desc",
				title: "Clear Desc",
				description: "Has description",
			});

			const updated = await library.updateStory(created.id, {description: null});
			expect(updated?.description).toBeNull();
		});

		it("updates story tags - add tags", async () => {
			const library = getLibrary("story-user-add-tags");
			const story = await library.createStory({
				url: "https://example.com/add-tags",
				title: "Add Tags",
			});
			const tag1 = await library.createTag("add1", "111111");
			const tag2 = await library.createTag("add2", "222222");

			const updated = await library.updateStory(story.id, {tagIds: [tag1.id, tag2.id]});
			expect(updated?.tags).toHaveLength(2);
		});

		it("updates story tags - remove tags", async () => {
			const library = getLibrary("story-user-remove-tags");
			const tag = await library.createTag("remove-me", "333333");
			const story = await library.createStory({
				url: "https://example.com/remove-tags",
				title: "Remove Tags",
				tagIds: [tag.id],
			});
			expect(story.tags).toHaveLength(1);

			const updated = await library.updateStory(story.id, {tagIds: []});
			expect(updated?.tags).toHaveLength(0);
		});

		it("updates story tags - replace tags", async () => {
			const library = getLibrary("story-user-replace-tags");
			const tagA = await library.createTag("tagA", "aaaaaa");
			const tagB = await library.createTag("tagB", "bbbbbb");

			const story = await library.createStory({
				url: "https://example.com/replace-tags",
				title: "Replace Tags",
				tagIds: [tagA.id],
			});
			expect(story.tags[0].id).toBe(tagA.id);

			const updated = await library.updateStory(story.id, {tagIds: [tagB.id]});
			expect(updated?.tags).toHaveLength(1);
			expect(updated?.tags[0].id).toBe(tagB.id);
		});

		it("sets updatedAt timestamp on update", async () => {
			const library = getLibrary("story-user-updated-at");
			const story = await library.createStory({
				url: "https://example.com/updated-at",
				title: "Original",
			});

			// New story has no updatedAt
			expect(story.updatedAt).toBeNull();

			// Wait a bit then update
			await new Promise((r) => setTimeout(r, 10));
			const updated = await library.updateStory(story.id, {title: "Updated"});

			expect(updated?.updatedAt).not.toBeNull();
			const createdTime = new Date(story.createdAt).getTime();
			const updatedTime = new Date(updated!.updatedAt!).getTime();
			expect(updatedTime).toBeGreaterThan(createdTime);
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

		it("lists stories with their tags", async () => {
			const library = getLibrary("story-user-list-tags");
			const tag1 = await library.createTag("tag-list-1", "111111");
			const tag2 = await library.createTag("tag-list-2", "222222");

			await library.createStory({
				url: "https://example.com/list-tag-1",
				title: "Story with tag1",
				tagIds: [tag1.id],
			});
			await library.createStory({
				url: "https://example.com/list-tag-2",
				title: "Story with tag2",
				tagIds: [tag2.id],
			});
			await library.createStory({
				url: "https://example.com/list-tag-both",
				title: "Story with both",
				tagIds: [tag1.id, tag2.id],
			});

			const result = await library.listStories({first: 10});

			// Stories ordered by id desc (newest first)
			expect(result.edges).toHaveLength(3);
			expect(result.edges[0].tags).toHaveLength(2); // both
			expect(result.edges[1].tags).toHaveLength(1); // tag2
			expect(result.edges[2].tags).toHaveLength(1); // tag1

			// Verify correct tags (not mixed up)
			expect(result.edges[2].tags[0].id).toBe(tag1.id);
			expect(result.edges[1].tags[0].id).toBe(tag2.id);
		});
	});
});
