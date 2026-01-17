import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {
	InvalidTagColorError,
	InvalidTagNameError,
	InvalidUrlError,
	TagNameExistsError,
} from "@kampus/library";
import {id} from "@usirin/forge";
import {and, asc, count, desc, sql as drizzleSql, eq, inArray, lt} from "drizzle-orm";
import {Effect} from "effect";
import {DurableObjectEnv} from "../../services";
import {makeWebPageParserClient} from "../web-page-parser/client";
import * as schema from "./drizzle/drizzle.schema";
import {getNormalizedUrl} from "./getNormalizedUrl";
import {isValidHexColor, validateTagName} from "./schema";

// Helper to format story response
const formatStory = (
	story: {
		id: string;
		url: string;
		title: string;
		description: string | null;
		createdAt: Date;
		updatedAt: Date | null;
	},
	tags: Array<{id: string; name: string; color: string}>,
) => ({
	id: story.id,
	url: story.url,
	title: story.title,
	description: story.description,
	createdAt: story.createdAt.toISOString(),
	updatedAt: story.updatedAt?.toISOString() ?? null,
	tags,
});

// Fetch tags for multiple stories in one query
const getTagsForStoriesSimple = (storyIds: string[]) =>
	Effect.gen(function* () {
		if (storyIds.length === 0) {
			return new Map<string, Array<{id: string; name: string; color: string}>>();
		}
		const db = yield* SqliteDrizzle;

		// Join story_tag with tag, filter by story IDs
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
	getStory: ({id: storyId}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;
			const [story] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			if (!story) return null;

			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);
			return formatStory(story, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.orDie),

	getBatchStory: ({ids}: {ids: readonly string[]}) =>
		Effect.gen(function* () {
			if (ids.length === 0) return [];

			const db = yield* SqliteDrizzle;
			const stories = yield* db
				.select()
				.from(schema.story)
				.where(inArray(schema.story.id, [...ids]));

			const storyMap = new Map(stories.map((s) => [s.id, s]));
			const storyIds = stories.map((s) => s.id);
			const tagsByStory = yield* getTagsForStoriesSimple(storyIds);

			// Return array preserving input order, null for missing stories
			return ids.map((storyId) => {
				const story = storyMap.get(storyId);
				if (!story) return null;
				return formatStory(story, tagsByStory.get(storyId) ?? []);
			});
		}).pipe(Effect.orDie),

	listStories: ({first, after}: {first?: number; after?: string}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;
			const limit = first ?? 20;

			// Get total count
			const [countResult] = yield* db.select({total: count()}).from(schema.story);
			const totalCount = countResult?.total ?? 0;

			// Get stories with pagination
			const baseQuery = db
				.select()
				.from(schema.story)
				.orderBy(desc(schema.story.id))
				.limit(limit + 1);

			const stories = after ? yield* baseQuery.where(lt(schema.story.id, after)) : yield* baseQuery;

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
			const db = yield* SqliteDrizzle;
			const limit = first ?? 20;

			// Count total stories with this tag
			const [countResult] = yield* db
				.select({total: count()})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.tagId, tagId));
			const totalCount = countResult?.total ?? 0;

			// Get story IDs for this tag with pagination
			const baseQuery = db
				.select({storyId: schema.storyTag.storyId})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.tagId, tagId))
				.orderBy(desc(schema.storyTag.storyId))
				.limit(limit + 1);

			const storyIdRows = after
				? yield* db
						.select({storyId: schema.storyTag.storyId})
						.from(schema.storyTag)
						.where(and(eq(schema.storyTag.tagId, tagId), lt(schema.storyTag.storyId, after)))
						.orderBy(desc(schema.storyTag.storyId))
						.limit(limit + 1)
				: yield* baseQuery;

			const hasNextPage = storyIdRows.length > limit;
			const paginatedIds = storyIdRows.slice(0, limit).map((r) => r.storyId);

			if (paginatedIds.length === 0) {
				return {stories: [], hasNextPage: false, endCursor: null, totalCount};
			}

			// Fetch stories using inArray
			const stories = yield* db
				.select()
				.from(schema.story)
				.where(inArray(schema.story.id, paginatedIds));

			// Sort to match pagination order
			const storyMap = new Map(stories.map((s) => [s.id, s]));
			const orderedStories = paginatedIds
				.map((pid) => storyMap.get(pid))
				.filter((s): s is (typeof stories)[number] => s !== undefined);

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

			const db = yield* SqliteDrizzle;
			const storyId = id("story");
			const normalizedUrl = getNormalizedUrl(url);

			const [story] = yield* db
				.insert(schema.story)
				.values({
					id: storyId,
					url,
					normalizedUrl,
					title,
					description: description ?? null,
				})
				.returning();

			// Tag the story if tagIds provided
			if (tagIds && tagIds.length > 0) {
				const existingTags = yield* db
					.select({id: schema.tag.id})
					.from(schema.tag)
					.where(inArray(schema.tag.id, [...tagIds]));
				const validTagIds = tagIds.filter((tid) => existingTags.some((t) => t.id === tid));

				if (validTagIds.length > 0) {
					yield* db
						.insert(schema.storyTag)
						.values(validTagIds.map((tagId) => ({storyId, tagId})))
						.onConflictDoNothing();
				}
			}

			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);

			return formatStory(story, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.catchTag("SqlError", Effect.die)),

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
			const db = yield* SqliteDrizzle;

			// Check if story exists
			const [existing] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			if (!existing) return null;

			// Update fields if provided
			const hasFieldUpdate = title !== undefined || description !== undefined;
			const hasTagUpdate = tagIds !== undefined;
			if (hasFieldUpdate || hasTagUpdate) {
				const newTitle = title ?? existing.title;
				const newDesc = description === undefined ? existing.description : description;
				yield* db
					.update(schema.story)
					.set({title: newTitle, description: newDesc, updatedAt: new Date()})
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
							and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, toRemove)),
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
						yield* db
							.insert(schema.storyTag)
							.values(validTagIds.map((tagId) => ({storyId, tagId})))
							.onConflictDoNothing();
					}
				}
			}

			// Fetch updated story
			const [updated] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			const tagsByStory = yield* getTagsForStoriesSimple([storyId]);

			return formatStory(updated!, tagsByStory.get(storyId) ?? []);
		}).pipe(Effect.orDie),

	deleteStory: ({id: storyId}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

			// Check if story exists
			const [existing] = yield* db.select().from(schema.story).where(eq(schema.story.id, storyId));
			if (!existing) return {deleted: false};

			// Delete the story (cascade will handle story_tag associations)
			yield* db.delete(schema.story).where(eq(schema.story.id, storyId));

			return {deleted: true};
		}).pipe(Effect.orDie),

	getBatchTag: ({ids}: {ids: readonly string[]}) =>
		Effect.gen(function* () {
			if (ids.length === 0) return [];

			const db = yield* SqliteDrizzle;

			// Subquery for story count
			const storyCountSubquery = db
				.select({
					tagId: schema.storyTag.tagId,
					count: count().as("count"),
				})
				.from(schema.storyTag)
				.groupBy(schema.storyTag.tagId)
				.as("story_counts");

			// Fetch tags with story counts
			const tags = yield* db
				.select({
					id: schema.tag.id,
					name: schema.tag.name,
					color: schema.tag.color,
					createdAt: schema.tag.createdAt,
					storyCount: drizzleSql<number>`COALESCE(${storyCountSubquery.count}, 0)`,
				})
				.from(schema.tag)
				.leftJoin(storyCountSubquery, eq(schema.tag.id, storyCountSubquery.tagId))
				.where(inArray(schema.tag.id, [...ids]));

			// Build map for O(1) lookup
			const tagMap = new Map(
				tags.map((t) => [
					t.id,
					{
						id: t.id,
						name: t.name,
						color: t.color,
						createdAt: t.createdAt.toISOString(),
						storyCount: t.storyCount,
					},
				]),
			);

			// Return array preserving input order, null for missing tags
			return ids.map((tagId) => tagMap.get(tagId) ?? null);
		}).pipe(Effect.orDie),

	listTags: () =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

			// Subquery for story count
			const storyCountSubquery = db
				.select({
					tagId: schema.storyTag.tagId,
					count: count().as("count"),
				})
				.from(schema.storyTag)
				.groupBy(schema.storyTag.tagId)
				.as("story_counts");

			// Join tags with story counts
			const tags = yield* db
				.select({
					id: schema.tag.id,
					name: schema.tag.name,
					color: schema.tag.color,
					createdAt: schema.tag.createdAt,
					storyCount: drizzleSql<number>`COALESCE(${storyCountSubquery.count}, 0)`,
				})
				.from(schema.tag)
				.leftJoin(storyCountSubquery, eq(schema.tag.id, storyCountSubquery.tagId))
				.orderBy(asc(schema.tag.name));

			return tags.map((tag) => ({
				id: tag.id,
				name: tag.name,
				color: tag.color,
				createdAt: tag.createdAt.toISOString(),
				storyCount: tag.storyCount,
			}));
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

			const db = yield* SqliteDrizzle;

			// Check uniqueness (case-insensitive)
			const [existing] = yield* db
				.select()
				.from(schema.tag)
				.where(drizzleSql`lower(${schema.tag.name}) = lower(${name})`);

			if (existing) {
				return yield* Effect.fail(new TagNameExistsError({tagName: name}));
			}

			const tagId = id("tag");
			const lowerColor = color.toLowerCase();

			const [tag] = yield* db
				.insert(schema.tag)
				.values({
					id: tagId,
					name,
					color: lowerColor,
				})
				.returning();

			return {
				id: tag.id,
				name: tag.name,
				color: tag.color,
				createdAt: tag.createdAt.toISOString(),
				storyCount: 0,
			};
		}).pipe(Effect.catchTag("SqlError", Effect.die)),

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

			const db = yield* SqliteDrizzle;

			// Check if tag exists
			const [existing] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			if (!existing) return null;

			// Get story count
			const [countResult] = yield* db
				.select({count: count()})
				.from(schema.storyTag)
				.where(eq(schema.storyTag.tagId, tagId));
			const storyCount = countResult?.count ?? 0;

			// If no updates provided, return existing tag
			if (!name && !color) {
				return {
					id: existing.id,
					name: existing.name,
					color: existing.color,
					createdAt: existing.createdAt.toISOString(),
					storyCount,
				};
			}

			// Check uniqueness if updating name (case-insensitive)
			if (name) {
				const [duplicate] = yield* db
					.select()
					.from(schema.tag)
					.where(
						and(
							drizzleSql`lower(${schema.tag.name}) = lower(${name})`,
							drizzleSql`${schema.tag.id} != ${tagId}`,
						),
					);
				if (duplicate) {
					return yield* Effect.fail(new TagNameExistsError({tagName: name}));
				}
			}

			const newName = name ?? existing.name;
			const newColor = color ? color.toLowerCase() : existing.color;

			yield* db
				.update(schema.tag)
				.set({name: newName, color: newColor})
				.where(eq(schema.tag.id, tagId));

			const [updated] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			return {
				id: updated!.id,
				name: updated!.name,
				color: updated!.color,
				createdAt: updated!.createdAt.toISOString(),
				storyCount,
			};
		}).pipe(Effect.catchTag("SqlError", Effect.die)),

	deleteTag: ({id: tagId}: {id: string}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

			// Check if tag exists
			const [existing] = yield* db.select().from(schema.tag).where(eq(schema.tag.id, tagId));
			if (!existing) return {deleted: false};

			// FK cascade handles story_tag cleanup
			yield* db.delete(schema.tag).where(eq(schema.tag.id, tagId));

			return {deleted: true};
		}).pipe(Effect.orDie),

	getTagsForStory: ({storyId}: {storyId: string}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

			// Subquery for story count per tag
			const storyCountSubquery = db
				.select({
					tagId: schema.storyTag.tagId,
					count: count().as("count"),
				})
				.from(schema.storyTag)
				.groupBy(schema.storyTag.tagId)
				.as("story_counts");

			// Get tags for this story with story counts via join
			const results = yield* db
				.select({
					id: schema.tag.id,
					name: schema.tag.name,
					color: schema.tag.color,
					createdAt: schema.tag.createdAt,
					storyCount: drizzleSql<number>`COALESCE(${storyCountSubquery.count}, 0)`,
				})
				.from(schema.storyTag)
				.innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
				.leftJoin(storyCountSubquery, eq(schema.tag.id, storyCountSubquery.tagId))
				.where(eq(schema.storyTag.storyId, storyId));

			return results.map((tag) => ({
				id: tag.id,
				name: tag.name,
				color: tag.color,
				createdAt: tag.createdAt.toISOString(),
				storyCount: tag.storyCount,
			}));
		}).pipe(Effect.orDie),

	setStoryTags: ({storyId, tagIds}: {storyId: string; tagIds: readonly string[]}) =>
		Effect.gen(function* () {
			const db = yield* SqliteDrizzle;

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
						and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, toRemove)),
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
					yield* db
						.insert(schema.storyTag)
						.values(validTagIds.map((tagId) => ({storyId, tagId})))
						.onConflictDoNothing();
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
