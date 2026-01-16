import {SqlClient, type SqlError} from "@effect/sql";
import {
	InvalidTagColorError,
	InvalidTagNameError,
	InvalidUrlError,
	TagNameExistsError,
} from "@kampus/library";
import {id} from "@usirin/forge";
import {DateTime, Effect, Option} from "effect";
import {DurableObjectEnv} from "../../services";
import {makeWebPageParserClient} from "../web-page-parser/client";
import {getNormalizedUrl} from "./getNormalizedUrl";
import {Story, StoryRepo, Tag, TagRepo} from "./models";
import {isValidHexColor, validateTagName} from "./schema";

// Helper to convert SqlError to defects while preserving typed errors
const orDieSql = <A, E, R>(
	effect: Effect.Effect<A, E | SqlError.SqlError, R>,
): Effect.Effect<A, E, R> =>
	effect.pipe(Effect.catchTag("SqlError", (e) => Effect.die(e))) as Effect.Effect<A, E, R>;

// Row types (camelCase - SqlClient transforms handle snake_case columns)
interface StoryRow {
	id: string;
	url: string;
	title: string;
	description: string | null;
	createdAt: number;
	updatedAt: number | null;
}

interface TagRow {
	id: string;
	name: string;
	color: string;
	createdAt: number;
}

interface StoryTagRow {
	storyId: string;
	tagId: string;
	tagName: string;
	tagColor: string;
}

// Helper to format story with tags (from raw row)
const formatStory = (story: StoryRow, tags: Array<{id: string; name: string; color: string}>) => ({
	id: story.id,
	url: story.url,
	title: story.title,
	description: story.description,
	createdAt: new Date(story.createdAt).toISOString(),
	updatedAt: story.updatedAt ? new Date(story.updatedAt).toISOString() : null,
	tags,
});

// Helper to format story from Model instance
const formatStoryFromModel = (
	story: Story,
	tags: Array<{id: string; name: string; color: string}>,
) => ({
	id: story.id,
	url: story.url,
	title: story.title,
	description: Option.getOrNull(story.description),
	createdAt: DateTime.formatIso(story.createdAt),
	updatedAt: Option.match(story.updatedAt, {
		onNone: () => null,
		onSome: (ms) => new Date(ms).toISOString(),
	}),
	tags,
});

// Helper to format tag (from raw row)
const formatTag = (tag: TagRow, storyCount: number) => ({
	id: tag.id,
	name: tag.name,
	color: tag.color,
	createdAt: new Date(tag.createdAt).toISOString(),
	storyCount,
});

// Helper to format tag from Model instance
const formatTagFromModel = (tag: Tag, storyCount: number) => ({
	id: tag.id,
	name: tag.name,
	color: tag.color,
	createdAt: DateTime.formatIso(tag.createdAt),
	storyCount,
});

// Fetch tags for multiple stories in one query
const getTagsForStoriesSimple = (storyIds: string[]) =>
	Effect.gen(function* () {
		if (storyIds.length === 0) {
			return new Map<string, Array<{id: string; name: string; color: string}>>();
		}
		const sql = yield* SqlClient.SqlClient;
		// Build a simple query with interpolated IDs (safe since we control them)
		const idList = storyIds.map((id) => `'${id}'`).join(", ");
		const rows = yield* sql.unsafe<StoryTagRow>(`
			SELECT st.story_id, t.id as tag_id, t.name as tag_name, t.color as tag_color
			FROM story_tag st
			INNER JOIN tag t ON st.tag_id = t.id
			WHERE st.story_id IN (${idList})
		`);

		const tagsByStory = new Map<string, Array<{id: string; name: string; color: string}>>();
		for (const row of rows) {
			const tags = tagsByStory.get(row.storyId) ?? [];
			tags.push({id: row.tagId, name: row.tagName, color: row.tagColor});
			tagsByStory.set(row.storyId, tags);
		}
		return tagsByStory;
	});

export const handlers = {
	getStory: ({id: storyId}: {id: string}) =>
		Effect.gen(function* () {
			const storyRepo = yield* StoryRepo;
			const storyOpt = yield* storyRepo.findById(storyId);
			if (Option.isNone(storyOpt)) return null;

			const story = storyOpt.value;
			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);
			return formatStoryFromModel(story, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.orDie),

	listStories: ({first, after}: {first?: number; after?: string}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const limit = first ?? 20;

			// Get total count
			const countRows = yield* sql<{count: number}>`SELECT COUNT(*) as count FROM story`;
			const totalCount = countRows[0]?.count ?? 0;

			// Get stories with pagination
			const stories = after
				? yield* sql<StoryRow>`SELECT * FROM story WHERE id < ${after} ORDER BY id DESC LIMIT ${limit + 1}`
				: yield* sql<StoryRow>`SELECT * FROM story ORDER BY id DESC LIMIT ${limit + 1}`;

			const hasNextPage = stories.length > limit;
			const edges = stories.slice(0, limit);

			const tagsByStory = yield* getTagsForStoriesSimple(edges.map((s) => s.id));

			return {
				stories: edges.map((s) => formatStory(s, tagsByStory.get(s.id) ?? [])),
				hasNextPage,
				endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
				totalCount,
			};
		}).pipe(Effect.orDie),

	listStoriesByTag: ({tagId, first, after}: {tagId: string; first?: number; after?: string}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const limit = first ?? 20;

			// Count total stories with this tag
			const countRows = yield* sql<{count: number}>`
				SELECT COUNT(*) as count FROM story_tag WHERE tag_id = ${tagId}
			`;
			const totalCount = countRows[0]?.count ?? 0;

			// Get story IDs for this tag
			const storyIdRows = after
				? yield* sql<{storyId: string}>`
					SELECT story_id FROM story_tag
					WHERE tag_id = ${tagId} AND story_id < ${after}
					ORDER BY story_id DESC LIMIT ${limit + 1}
				`
				: yield* sql<{storyId: string}>`
					SELECT story_id FROM story_tag
					WHERE tag_id = ${tagId}
					ORDER BY story_id DESC LIMIT ${limit + 1}
				`;

			const hasNextPage = storyIdRows.length > limit;
			const paginatedIds = storyIdRows.slice(0, limit).map((r) => r.storyId);

			if (paginatedIds.length === 0) {
				return {stories: [], hasNextPage: false, endCursor: null, totalCount};
			}

			// Fetch stories
			const idList = paginatedIds.map((id) => `'${id}'`).join(", ");
			const stories = yield* sql.unsafe<StoryRow>(`SELECT * FROM story WHERE id IN (${idList})`);

			// Sort to match order
			const storyMap = new Map(stories.map((s) => [s.id, s]));
			const orderedStories = paginatedIds
				.map((id) => storyMap.get(id))
				.filter((s): s is StoryRow => s !== undefined);

			const tagsByStory = yield* getTagsForStoriesSimple(paginatedIds);

			return {
				stories: orderedStories.map((s) => formatStory(s, tagsByStory.get(s.id) ?? [])),
				hasNextPage,
				endCursor: orderedStories.length > 0 ? orderedStories[orderedStories.length - 1].id : null,
				totalCount,
			};
		}).pipe(Effect.orDie),

	createStory: ({
		url,
		title,
		description,
		tagIds,
	}: {
		url: string;
		title: string;
		description?: string;
		tagIds?: readonly string[];
	}) =>
		Effect.gen(function* () {
			// Validate URL format
			try {
				new URL(url);
			} catch {
				return yield* Effect.fail(new InvalidUrlError({url}));
			}

			const sql = yield* SqlClient.SqlClient;
			const storyRepo = yield* StoryRepo;
			const storyId = id("story");
			const normalizedUrl = getNormalizedUrl(url);

			const story = yield* storyRepo.insert(
				Story.insert.make({
					id: storyId,
					url,
					normalizedUrl,
					title,
					description: Option.fromNullable(description),
					updatedAt: Option.none(),
				}),
			);

			// Tag the story if tagIds provided
			if (tagIds && tagIds.length > 0) {
				const idList = tagIds.map((id) => `'${id}'`).join(", ");
				const existingTags = yield* sql.unsafe<{id: string}>(
					`SELECT id FROM tag WHERE id IN (${idList})`,
				);
				const validTagIds = tagIds.filter((id) => existingTags.some((t) => t.id === id));

				for (const tagId of validTagIds) {
					yield* sql`INSERT OR IGNORE INTO story_tag (story_id, tag_id) VALUES (${storyId}, ${tagId})`;
				}
			}

			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);

			return formatStoryFromModel(story, tagsByStory.get(storyId) ?? []);
		}).pipe(orDieSql),

	updateStory: ({
		id: storyId,
		title,
		description,
		tagIds,
	}: {
		id: string;
		title?: string;
		description?: string | null;
		tagIds?: readonly string[];
	}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Check if story exists
			const existingRows = yield* sql<StoryRow>`SELECT * FROM story WHERE id = ${storyId}`;
			const existing = existingRows[0];
			if (!existing) return null;

			// Update fields if provided
			const hasFieldUpdate = title !== undefined || description !== undefined;
			const hasTagUpdate = tagIds !== undefined;
			if (hasFieldUpdate || hasTagUpdate) {
				const newTitle = title ?? existing.title;
				const newDesc = description === undefined ? existing.description : description;
				const now = Date.now();
				yield* sql`UPDATE story SET title = ${newTitle}, description = ${newDesc}, updated_at = ${now} WHERE id = ${storyId}`;
			}

			// Update tags if provided
			if (tagIds !== undefined) {
				// Get current tags
				const currentTagRows = yield* sql<{tagId: string}>`
					SELECT tag_id FROM story_tag WHERE story_id = ${storyId}
				`;
				const currentIds = new Set(currentTagRows.map((t) => t.tagId));
				const newIds = new Set(tagIds);

				// Remove old tags
				const toRemove = [...currentIds].filter((tid) => !newIds.has(tid));
				for (const tagId of toRemove) {
					yield* sql`DELETE FROM story_tag WHERE story_id = ${storyId} AND tag_id = ${tagId}`;
				}

				// Add new tags
				const toAdd = [...newIds].filter((tid) => !currentIds.has(tid));
				if (toAdd.length > 0) {
					const idList = toAdd.map((id) => `'${id}'`).join(", ");
					const existingTags = yield* sql.unsafe<{id: string}>(
						`SELECT id FROM tag WHERE id IN (${idList})`,
					);
					const validTagIds = toAdd.filter((tid) => existingTags.some((t) => t.id === tid));

					for (const tagId of validTagIds) {
						yield* sql`INSERT OR IGNORE INTO story_tag (story_id, tag_id) VALUES (${storyId}, ${tagId})`;
					}
				}
			}

			// Fetch updated story
			const updatedRows = yield* sql<StoryRow>`SELECT * FROM story WHERE id = ${storyId}`;
			const updated = updatedRows[0]!;
			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);

			return formatStory(updated, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.orDie),

	deleteStory: ({id: storyId}: {id: string}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const storyRepo = yield* StoryRepo;

			const storyOpt = yield* storyRepo.findById(storyId);
			if (Option.isNone(storyOpt)) return {deleted: false};

			// Delete tag associations (cascade should handle, but be explicit)
			yield* sql`DELETE FROM story_tag WHERE story_id = ${storyId}`;
			yield* storyRepo.delete(storyId);

			return {deleted: true};
		}).pipe(Effect.orDie),

	listTags: () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const tags = yield* sql<TagRow & {storyCount: number}>`
				SELECT t.*, (SELECT COUNT(*) FROM story_tag WHERE tag_id = t.id) as story_count
				FROM tag t
				ORDER BY t.name
			`;

			return tags.map((tag) => formatTag(tag, tag.storyCount));
		}).pipe(Effect.orDie),

	createTag: ({name, color}: {name: string; color: string}) =>
		Effect.gen(function* () {
			// Validate tag name
			const nameValidation = validateTagName(name);
			if (!nameValidation.valid) {
				return yield* Effect.fail(new InvalidTagNameError({name, reason: nameValidation.reason}));
			}

			// Validate color format
			if (!isValidHexColor(color)) {
				return yield* Effect.fail(new InvalidTagColorError({color}));
			}

			const sql = yield* SqlClient.SqlClient;
			const tagRepo = yield* TagRepo;

			// Check uniqueness (case-insensitive) - keep raw SQL for case-insensitive query
			const existingRows = yield* sql<TagRow>`SELECT * FROM tag WHERE lower(name) = lower(${name})`;
			if (existingRows[0]) {
				return yield* Effect.fail(new TagNameExistsError({tagName: name}));
			}

			const tagId = id("tag");
			const lowerColor = color.toLowerCase();

			const tag = yield* tagRepo.insert(
				Tag.insert.make({
					id: tagId,
					name,
					color: lowerColor,
				}),
			);

			return formatTagFromModel(tag, 0);
		}).pipe(orDieSql),

	updateTag: ({id: tagId, name, color}: {id: string; name?: string; color?: string}) =>
		Effect.gen(function* () {
			// Validate tag name if provided
			if (name) {
				const nameValidation = validateTagName(name);
				if (!nameValidation.valid) {
					return yield* Effect.fail(new InvalidTagNameError({name, reason: nameValidation.reason}));
				}
			}

			// Validate color format if provided
			if (color && !isValidHexColor(color)) {
				return yield* Effect.fail(new InvalidTagColorError({color}));
			}

			const sql = yield* SqlClient.SqlClient;

			const existingRows = yield* sql<TagRow>`SELECT * FROM tag WHERE id = ${tagId}`;
			const existing = existingRows[0];
			if (!existing) return null;

			// Get story count
			const countRows = yield* sql<{
				count: number;
			}>`SELECT COUNT(*) as count FROM story_tag WHERE tag_id = ${tagId}`;
			const storyCount = countRows[0]?.count ?? 0;

			// If no updates provided, return existing tag
			if (!name && !color) {
				return formatTag(existing, storyCount);
			}

			// Check uniqueness if updating name
			if (name) {
				const duplicateRows = yield* sql<TagRow>`
					SELECT * FROM tag WHERE lower(name) = lower(${name}) AND id != ${tagId}
				`;
				if (duplicateRows[0]) {
					return yield* Effect.fail(new TagNameExistsError({tagName: name}));
				}
			}

			const newName = name ?? existing.name;
			const newColor = color ? color.toLowerCase() : existing.color;

			yield* sql`UPDATE tag SET name = ${newName}, color = ${newColor} WHERE id = ${tagId}`;

			const updatedRows = yield* sql<TagRow>`SELECT * FROM tag WHERE id = ${tagId}`;
			return formatTag(updatedRows[0]!, storyCount);
		}).pipe(orDieSql),

	deleteTag: ({id: tagId}: {id: string}) =>
		Effect.gen(function* () {
			const tagRepo = yield* TagRepo;

			const tagOpt = yield* tagRepo.findById(tagId);
			if (Option.isNone(tagOpt)) return {deleted: false};

			// FK cascade handles story_tag cleanup
			yield* tagRepo.delete(tagId);

			return {deleted: true};
		}).pipe(Effect.orDie),

	getTagsForStory: ({storyId}: {storyId: string}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const results = yield* sql<TagRow & {storyCount: number}>`
				SELECT t.*, (SELECT COUNT(*) FROM story_tag st WHERE st.tag_id = t.id) as story_count
				FROM story_tag st
				INNER JOIN tag t ON st.tag_id = t.id
				WHERE st.story_id = ${storyId}
			`;

			return results.map((tag) => formatTag(tag, tag.storyCount));
		}).pipe(Effect.orDie),

	setStoryTags: ({storyId, tagIds}: {storyId: string; tagIds: readonly string[]}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Get current tags
			const currentTagRows = yield* sql<{
				tagId: string;
			}>`SELECT tag_id FROM story_tag WHERE story_id = ${storyId}`;
			const currentIds = new Set(currentTagRows.map((t) => t.tagId));
			const newIds = new Set(tagIds);

			// Remove old tags
			const toRemove = [...currentIds].filter((id) => !newIds.has(id));
			for (const tagId of toRemove) {
				yield* sql`DELETE FROM story_tag WHERE story_id = ${storyId} AND tag_id = ${tagId}`;
			}

			// Add new tags
			const toAdd = [...newIds].filter((id) => !currentIds.has(id));
			if (toAdd.length > 0) {
				const idList = toAdd.map((id) => `'${id}'`).join(", ");
				const existingTags = yield* sql.unsafe<{id: string}>(
					`SELECT id FROM tag WHERE id IN (${idList})`,
				);
				const validTagIds = toAdd.filter((id) => existingTags.some((t) => t.id === id));

				for (const tagId of validTagIds) {
					yield* sql`INSERT OR IGNORE INTO story_tag (story_id, tag_id) VALUES (${storyId}, ${tagId})`;
				}
			}

			return {success: true};
		}).pipe(Effect.orDie),

	fetchUrlMetadata: ({url}: {url: string}) =>
		Effect.gen(function* () {
			// Validate URL format
			let parsedUrl: URL;
			try {
				parsedUrl = new URL(url);
			} catch {
				return {title: null, description: null, error: "Invalid URL format"};
			}

			// Only allow http/https (SSRF prevention)
			if (!["http:", "https:"].includes(parsedUrl.protocol)) {
				return {title: null, description: null, error: "Only HTTP/HTTPS URLs are allowed"};
			}

			const env = yield* DurableObjectEnv;

			return yield* Effect.tryPromise({
				try: async () => {
					// Use normalized URL as DO key for deduplication
					const normalizedUrl = getNormalizedUrl(url);
					const parserId = env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
					const stub = env.WEB_PAGE_PARSER.get(parserId);

					// Use Effect RPC client to call WebPageParser
					const client = makeWebPageParserClient((req) => stub.fetch(req));
					try {
						await client.init(url);
						const metadata = await client.getMetadata();

						return {
							title: metadata.title || null,
							description: metadata.description || null,
							error: null,
						};
					} finally {
						await client.dispose();
					}
				},
				catch: (err) => {
					const message = err instanceof Error ? err.message : "Failed to fetch metadata";
					return {title: null, description: null, error: message};
				},
			}).pipe(Effect.catchAll((result) => Effect.succeed(result)));
		}).pipe(Effect.orDie),
};
