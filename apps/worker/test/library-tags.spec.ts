import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

describe("Library Tags", () => {
	const getLibrary = (userId: string) => {
		const id = env.LIBRARY.idFromName(userId);
		return env.LIBRARY.get(id);
	};

	describe("Tag CRUD", () => {
		it("creates a tag with valid name and color", async () => {
			const library = getLibrary("test-user-1");
			const tag = await library.createTag("javascript", "f7df1e");

			expect(tag.id).toMatch(/^tag_/);
			expect(tag.name).toBe("javascript");
			expect(tag.color).toBe("f7df1e");
			expect(tag.createdAt).toBeInstanceOf(Date);
		});

		it("normalizes color to lowercase", async () => {
			const library = getLibrary("test-user-2");
			const tag = await library.createTag("typescript", "3178C6");

			expect(tag.color).toBe("3178c6");
		});

		it.skip("rejects duplicate tag names (case-insensitive)", async () => {
			const library = getLibrary("test-user-3");
			await library.createTag("react", "61dafb");

			let error: Error | null = null;
			try {
				await library.createTag("React", "000000");
			} catch (e) {
				error = e as Error;
			}
			expect(error).not.toBeNull();
			expect(error?.message).toContain("Tag name already exists");
		});

		it("gets a tag by id", async () => {
			const library = getLibrary("test-user-4");
			const created = await library.createTag("vue", "4fc08d");

			const tag = await library.getTag(created.id);
			expect(tag).not.toBeNull();
			expect(tag?.name).toBe("vue");
		});

		it("returns null for non-existent tag", async () => {
			const library = getLibrary("test-user-5");
			const tag = await library.getTag("tag_nonexistent");

			expect(tag).toBeNull();
		});

		it("lists all tags", async () => {
			const library = getLibrary("test-user-6");
			await library.createTag("tag1", "111111");
			await library.createTag("tag2", "222222");
			await library.createTag("tag3", "333333");

			const tags = await library.listTags();
			expect(tags).toHaveLength(3);
			expect(tags.map((t) => t.name).sort()).toEqual(["tag1", "tag2", "tag3"]);
		});

		it("updates a tag name", async () => {
			const library = getLibrary("test-user-7");
			const created = await library.createTag("oldname", "aaaaaa");

			const updated = await library.updateTag(created.id, {name: "newname"});
			expect(updated?.name).toBe("newname");
			expect(updated?.color).toBe("aaaaaa");
		});

		it("updates a tag color", async () => {
			const library = getLibrary("test-user-8");
			const created = await library.createTag("colortest", "aaaaaa");

			const updated = await library.updateTag(created.id, {color: "BBBBBB"});
			expect(updated?.name).toBe("colortest");
			expect(updated?.color).toBe("bbbbbb");
		});

		it.skip("rejects update with duplicate name", async () => {
			const library = getLibrary("test-user-9");
			await library.createTag("existing", "111111");
			const second = await library.createTag("another", "222222");

			let error: Error | null = null;
			try {
				await library.updateTag(second.id, {name: "existing"});
			} catch (e) {
				error = e as Error;
			}
			expect(error).not.toBeNull();
			expect(error?.message).toContain("Tag name already exists");
		});

		it("returns null when updating non-existent tag", async () => {
			const library = getLibrary("test-user-10");

			const result = await library.updateTag("tag_nonexistent", {name: "foo"});
			expect(result).toBeNull();
		});

		it("deletes a tag", async () => {
			const library = getLibrary("test-user-11");
			const tag = await library.createTag("todelete", "ffffff");

			await library.deleteTag(tag.id);

			const deleted = await library.getTag(tag.id);
			expect(deleted).toBeNull();
		});

		it("no-op when deleting non-existent tag", async () => {
			const library = getLibrary("test-user-12");

			// Should not throw, just no-op
			await library.deleteTag("tag_nonexistent");
		});
	});

	describe("Story Tagging", () => {
		it("tags a story with a single tag", async () => {
			const library = getLibrary("test-user-20");
			const story = await library.createStory({url: "https://example.com/1", title: "Story 1"});
			const tag = await library.createTag("tech", "ff0000");

			await library.tagStory(story.id, [tag.id]);

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toHaveLength(1);
			expect(tags[0].name).toBe("tech");
		});

		it("tags a story with multiple tags", async () => {
			const library = getLibrary("test-user-21");
			const story = await library.createStory({url: "https://example.com/2", title: "Story 2"});
			const tag1 = await library.createTag("frontend", "ff0000");
			const tag2 = await library.createTag("backend", "00ff00");
			const tag3 = await library.createTag("devops", "0000ff");

			await library.tagStory(story.id, [tag1.id, tag2.id, tag3.id]);

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toHaveLength(3);
		});

		it("handles idempotent tagging (no duplicates)", async () => {
			const library = getLibrary("test-user-22");
			const story = await library.createStory({url: "https://example.com/3", title: "Story 3"});
			const tag = await library.createTag("duplicate", "cccccc");

			await library.tagStory(story.id, [tag.id]);
			await library.tagStory(story.id, [tag.id]); // Should not throw or create duplicate

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toHaveLength(1);
		});

		it("no-op when tagging non-existent story", async () => {
			const library = getLibrary("test-user-23");
			const tag = await library.createTag("orphan", "000000");

			// Should not throw, just no-op
			await library.tagStory("story_nonexistent", [tag.id]);
		});

		it("untags a story", async () => {
			const library = getLibrary("test-user-24");
			const story = await library.createStory({url: "https://example.com/4", title: "Story 4"});
			const tag1 = await library.createTag("keep", "111111");
			const tag2 = await library.createTag("remove", "222222");

			await library.tagStory(story.id, [tag1.id, tag2.id]);
			await library.untagStory(story.id, [tag2.id]);

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toHaveLength(1);
			expect(tags[0].name).toBe("keep");
		});

		it("returns empty array for story with no tags", async () => {
			const library = getLibrary("test-user-25");
			const story = await library.createStory({url: "https://example.com/5", title: "Story 5"});

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toEqual([]);
		});

		it("gets stories by tag", async () => {
			const library = getLibrary("test-user-26");
			const story1 = await library.createStory({url: "https://example.com/a", title: "Story A"});
			await library.createStory({url: "https://example.com/b", title: "Story B"}); // not tagged
			const story3 = await library.createStory({url: "https://example.com/c", title: "Story C"});
			const tag = await library.createTag("shared", "abcdef");

			await library.tagStory(story1.id, [tag.id]);
			await library.tagStory(story3.id, [tag.id]);

			const stories = await library.getStoriesByTag(tag.id);
			expect(stories).toHaveLength(2);
			expect(stories.map((s) => s.title).sort()).toEqual(["Story A", "Story C"]);
		});

		it("returns empty array for tag with no stories", async () => {
			const library = getLibrary("test-user-27");
			const tag = await library.createTag("lonely", "999999");

			const stories = await library.getStoriesByTag(tag.id);
			expect(stories).toEqual([]);
		});

		it("cascade deletes tag associations when tag is deleted", async () => {
			const library = getLibrary("test-user-28");
			const story = await library.createStory({url: "https://example.com/d", title: "Story D"});
			const tag = await library.createTag("temporary", "000000");

			await library.tagStory(story.id, [tag.id]);
			expect(await library.getTagsForStory(story.id)).toHaveLength(1);

			await library.deleteTag(tag.id);

			const tags = await library.getTagsForStory(story.id);
			expect(tags).toEqual([]);
		});
	});
});
