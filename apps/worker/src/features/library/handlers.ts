import {SqlError} from "@effect/sql";
import {make as makeSqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {
	InvalidTagColorError,
	InvalidTagNameError,
	InvalidUrlError,
	TagNameExistsError,
} from "@kampus/library";
import {id} from "@usirin/forge";
import {and, count, desc, eq, inArray, lt, ne, sql as drizzleSql} from "drizzle-orm";
import {Effect} from "effect";
import {DurableObjectEnv} from "../../services";
import {makeWebPageParserClient} from "../web-page-parser/client";
import * as schema from "./drizzle/drizzle.schema";
import {getNormalizedUrl} from "./getNormalizedUrl";
import {isValidHexColor, validateTagName} from "./schema";

// Helper to convert SqlError to defects while preserving typed errors
const orDieSql = <A, E, R>(effect: Effect.Effect<A, E | SqlError.SqlError, R>): Effect.Effect<A, E, R> =>
	effect.pipe(Effect.catchTag("SqlError", (e) => Effect.die(e))) as Effect.Effect<A, E, R>;

// Helper to get typed database
const getDb = () => makeSqliteDrizzle({schema});

// Type for story with tags
type StoryWithTags = typeof schema.story.$inferSelect & {
	tags: Array<{id: string; name: string; color: string}>;
};

// Helper to format story with tags
const formatStory = (
	story: typeof schema.story.$inferSelect,
	tags: Array<{id: string; name: string; color: string}>,
) => ({
	id: story.id,
	url: story.url,
	title: story.title,
	description: story.description,
	createdAt: story.createdAt.toISOString(),
	tags,
});

// Helper to format tag
const formatTag = (tag: typeof schema.tag.$inferSelect, storyCount: number) => ({
	id: tag.id,
	name: tag.name,
	color: tag.color,
	createdAt: tag.createdAt.toISOString(),
	storyCount,
});

// Fetch tags for multiple stories in one query
const getTagsForStories = (storyIds: string[]) =>
	Effect.gen(function* () {
		if (storyIds.length === 0) {
			return new Map<string, Array<{id: string; name: string; color: string}>>();
		}
		const db = yield* getDb();
		const rows = yield* db
			.select({
				storyId: schema.storyTag.storyId,
				tagId: schema.tag.id,
				tagName: schema.tag.name,
				tagColor: schema.tag.color,
			})
			.from(schema.storyTag)
			.innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
			.where(inArray(schema.storyTag.storyId, storyIds));

		const tagsByStory = new Map<string, Array<{id: string; name: string; color: string}>>();
		for (const row of rows) {
			const tags = tagsByStory.get(row.storyId) ?? [];
			tags.push({id: row.tagId, name: row.tagName, color: row.tagColor});
			tagsByStory.set(row.storyId, tags);
		}
		return tagsByStory;
	});

export const handlers = {
	getStory: ({id}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();
			const [story] = yield* db.select().from(schema.story).where(eq(schema.story.id, id));
			if (!story) return null;

			const tagsByStory = yield* getTagsForStories([id]);
			return formatStory(story, tagsByStory.get(id) ?? []);
		}).pipe(Effect.orDie),

	listStories: ({first, after}: {first?: number; after?: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();
			const limit = first ?? 20;

			// Get total count
			const countResult = yield* db.select({count: count()}).from(schema.story);
			const totalCount = countResult[0]?.count ?? 0;

			// Get stories with pagination
			const stories = after
				? yield* db
						.select()
						.from(schema.story)
						.where(lt(schema.story.id, after))
						.orderBy(desc(schema.story.id))
						.limit(limit + 1)
				: yield* db
						.select()
						.from(schema.story)
						.orderBy(desc(schema.story.id))
						.limit(limit + 1);

			const hasNextPage = stories.length > limit;
			const edges = stories.slice(0, limit);

			const tagsByStory = yield* getTagsForStories(edges.map((s) => s.id));

			return {
				stories: edges.map((s) => formatStory(s, tagsByStory.get(s.id) ?? [])),
				hasNextPage,
				endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
				totalCount,
			};
		}).pipe(Effect.orDie),

	listStoriesByTag: ({tagId, first, after}: {tagId: string; first?: number; after?: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();
			const limit = first ?? 20;

			// Count total stories with this tag
			const countResult = yield* db
				.select({count: count()})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.tagId, tagId));
			const totalCount = countResult[0]?.count ?? 0;

			// Get story IDs for this tag
			const storyIdRows = after
				? yield* db
						.select({storyId: schema.storyTag.storyId})
						.from(schema.storyTag)
						.where(and(eq(schema.storyTag.tagId, tagId), lt(schema.storyTag.storyId, after)))
						.orderBy(desc(schema.storyTag.storyId))
						.limit(limit + 1)
				: yield* db
						.select({storyId: schema.storyTag.storyId})
						.from(schema.storyTag)
						.where(eq(schema.storyTag.tagId, tagId))
						.orderBy(desc(schema.storyTag.storyId))
						.limit(limit + 1);

			const hasNextPage = storyIdRows.length > limit;
			const paginatedIds = storyIdRows.slice(0, limit).map((r) => r.storyId);

			if (paginatedIds.length === 0) {
				return {stories: [], hasNextPage: false, endCursor: null, totalCount};
			}

			// Fetch stories
			const stories = yield* db
				.select()
				.from(schema.story)
				.where(inArray(schema.story.id, paginatedIds));

			// Sort to match order
			const storyMap = new Map(stories.map((s) => [s.id, s]));
			const orderedStories = paginatedIds
				.map((id) => storyMap.get(id))
				.filter((s): s is typeof schema.story.$inferSelect => s !== undefined);

			const tagsByStory = yield* getTagsForStories(paginatedIds);

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

			const db = yield* getDb();
			const storyId = id("story");
			const normalizedUrl = getNormalizedUrl(url);

			yield* db.insert(schema.story).values({
				id: storyId,
				url,
				normalizedUrl,
				title,
				description: description ?? null,
			});

			// Tag the story if tagIds provided
			if (tagIds && tagIds.length > 0) {
				const existingTags = yield* db
					.select({id: schema.tag.id})
					.from(schema.tag)
					.where(inArray(schema.tag.id, [...tagIds]));
				const validTagIds = tagIds.filter((id) => existingTags.some((t) => t.id === id));

				if (validTagIds.length > 0) {
					yield* db.insert(schema.storyTag).values(
						validTagIds.map((tagId) => ({
							storyId,
							tagId,
						})),
					);
				}
			}

			const tagsByStory = yield* getTagsForStories([storyId]);
			const [story] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));

			return formatStory(story!, tagsByStory.get(storyId) ?? []);
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
			const db = yield* getDb();

			// Check if story exists
			const [existing] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			if (!existing) return null;

			// Update fields if provided
			if (title !== undefined || description !== undefined) {
				yield* db
					.update(schema.story)
					.set({
						title: title ?? existing.title,
						description: description === undefined ? existing.description : description,
					})
					.where(eq(schema.story.id, storyId));
			}

			// Update tags if provided
			if (tagIds !== undefined) {
				// Get current tags
				const currentTagRows = yield* db
					.select({tagId: schema.storyTag.tagId})
					.from(schema.storyTag)
					.where(eq(schema.storyTag.storyId, storyId));
				const currentIds = new Set(currentTagRows.map((t) => t.tagId));
				const newIds = new Set(tagIds);

				// Remove old tags
				const toRemove = [...currentIds].filter((tid) => !newIds.has(tid));
				if (toRemove.length > 0) {
					yield* db
						.delete(schema.storyTag)
						.where(
							and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, toRemove))
						);
				}

				// Add new tags
				const toAdd = [...newIds].filter((tid) => !currentIds.has(tid));
				if (toAdd.length > 0) {
					const existingTags = yield* db
						.select({id: schema.tag.id})
						.from(schema.tag)
						.where(inArray(schema.tag.id, toAdd));
					const validTagIds = toAdd.filter((tid) => existingTags.some((t) => t.id === tid));

					if (validTagIds.length > 0) {
						yield* db.insert(schema.storyTag).values(
							validTagIds.map((tagId) => ({
								storyId,
								tagId,
							})),
						);
					}
				}
			}

			// Fetch updated story
			const [updated] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			const tagsByStory = yield* getTagsForStories([storyId]);

			return formatStory(updated!, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.orDie),

	deleteStory: ({id: storyId}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();

			const [existing] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			if (!existing) return {deleted: false};

			// Delete tag associations (cascade should handle, but be explicit)
			yield* db.delete(schema.storyTag).where(eq(schema.storyTag.storyId, storyId));
			yield* db.delete(schema.story).where(eq(schema.story.id, storyId));

			return {deleted: true};
		}).pipe(Effect.orDie),

	listTags: () =>
		Effect.gen(function* () {
			const db = yield* getDb();

			const tags = yield* db.select().from(schema.tag);

			// Get story counts for all tags in one query
			const storyCounts = yield* db
				.select({
					tagId: schema.storyTag.tagId,
					count: count(),
				})
				.from(schema.storyTag)
				.groupBy(schema.storyTag.tagId);

			const countMap = new Map(storyCounts.map((sc) => [sc.tagId, sc.count]));

			return tags.map((tag) => formatTag(tag, countMap.get(tag.id) ?? 0));
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

			const db = yield* getDb();

			// Check uniqueness (case-insensitive)
			const existingRows = yield* db
				.select()
				.from(schema.tag)
				.where(drizzleSql`lower(name) = lower(${name})`);
			if (existingRows[0]) {
				return yield* Effect.fail(new TagNameExistsError({tagName: name}));
			}

			const tagId = id("tag");
			const lowerColor = color.toLowerCase();

			yield* db.insert(schema.tag).values({
				id: tagId,
				name,
				color: lowerColor,
			});

			const [created] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));

			return formatTag(created!, 0);
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

			const db = yield* getDb();

			const [existing] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			if (!existing) return null;

			// Get story count
			const countResult = yield* db
				.select({count: count()})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.tagId, tagId));
			const storyCount = countResult[0]?.count ?? 0;

			// If no updates provided, return existing tag
			if (!name && !color) {
				return formatTag(existing, storyCount);
			}

			// Check uniqueness if updating name
			if (name) {
				const duplicateRows = yield* db
					.select()
					.from(schema.tag)
					.where(
						and(
							drizzleSql`lower(name) = lower(${name})`,
							ne(schema.tag.id, tagId)
						)
					);
				if (duplicateRows[0]) {
					return yield* Effect.fail(new TagNameExistsError({tagName: name}));
				}
			}

			yield* db
				.update(schema.tag)
				.set({
					name: name ?? existing.name,
					color: color ? color.toLowerCase() : existing.color,
				})
				.where(eq(schema.tag.id, tagId));

			const [updated] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			return formatTag(updated!, storyCount);
		}).pipe(orDieSql),

	deleteTag: ({id: tagId}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();

			const [existing] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			if (!existing) return {deleted: false};

			// FK cascade handles story_tag cleanup
			yield* db.delete(schema.tag).where(eq(schema.tag.id, tagId));

			return {deleted: true};
		}).pipe(Effect.orDie),

	getTagsForStory: ({storyId}: {storyId: string}) =>
		Effect.gen(function* () {
			const db = yield* getDb();

			const results = yield* db
				.select({
					id: schema.tag.id,
					name: schema.tag.name,
					color: schema.tag.color,
					createdAt: schema.tag.createdAt,
				})
				.from(schema.storyTag)
				.innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
				.where(eq(schema.storyTag.storyId, storyId));

			// Get story counts for these tags
			const tagIds = results.map((t) => t.id);
			if (tagIds.length === 0) {
				return [];
			}

			const storyCounts = yield* db
				.select({
					tagId: schema.storyTag.tagId,
					count: count(),
				})
				.from(schema.storyTag)
				.where(inArray(schema.storyTag.tagId, tagIds))
				.groupBy(schema.storyTag.tagId);

			const countMap = new Map(storyCounts.map((sc) => [sc.tagId, sc.count]));

			return results.map((tag) => formatTag(tag, countMap.get(tag.id) ?? 0));
		}).pipe(Effect.orDie),

	setStoryTags: ({storyId, tagIds}: {storyId: string; tagIds: readonly string[]}) =>
		Effect.gen(function* () {
			const db = yield* getDb();

			// Get current tags
			const currentTagRows = yield* db
				.select({tagId: schema.storyTag.tagId})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.storyId, storyId));
			const currentIds = new Set(currentTagRows.map((t) => t.tagId));
			const newIds = new Set(tagIds);

			// Remove old tags
			const toRemove = [...currentIds].filter((id) => !newIds.has(id));
			if (toRemove.length > 0) {
				yield* db
					.delete(schema.storyTag)
					.where(
						and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, toRemove))
					);
			}

			// Add new tags
			const toAdd = [...newIds].filter((id) => !currentIds.has(id));
			if (toAdd.length > 0) {
				const existingTags = yield* db
					.select({id: schema.tag.id})
					.from(schema.tag)
					.where(inArray(schema.tag.id, toAdd));
				const validTagIds = toAdd.filter((id) => existingTags.some((t) => t.id === id));

				if (validTagIds.length > 0) {
					yield* db.insert(schema.storyTag).values(
						validTagIds.map((tagId) => ({
							storyId,
							tagId,
						})),
					);
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
			}).pipe(
				Effect.catchAll((result) => Effect.succeed(result)),
			);
		}).pipe(Effect.orDie),
};
