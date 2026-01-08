import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {InvalidUrlError, LibraryRpcs} from "@kampus/library";
import {and, desc, eq, inArray, lt, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {Effect, Layer, ManagedRuntime} from "effect";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {getNormalizedUrl} from "./getNormalizedUrl";
import {
	InvalidTagColorError,
	InvalidTagNameError,
	isValidHexColor,
	TagNameExistsError,
	validateTagName,
} from "./schema";

// keyed by user id
export class Library extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});

	// Helper to fetch tags for multiple stories
	private getTagsForStories(storyIds: string[]) {
		if (storyIds.length === 0)
			return new Map<string, Array<{id: string; name: string; color: string}>>();

		const storyTags = this.db
			.select({
				storyId: schema.storyTag.storyId,
				tagId: schema.tag.id,
				tagName: schema.tag.name,
				tagColor: schema.tag.color,
			})
			.from(schema.storyTag)
			.innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
			.where(inArray(schema.storyTag.storyId, storyIds))
			.all();

		const tagsByStory = new Map<string, Array<{id: string; name: string; color: string}>>();
		for (const row of storyTags) {
			const tags = tagsByStory.get(row.storyId) ?? [];
			tags.push({id: row.tagId, name: row.tagName, color: row.tagColor});
			tagsByStory.set(row.storyId, tags);
		}
		return tagsByStory;
	}

	// Effect RPC handlers - all business logic lives here
	private handlers = {
		getStory: ({id}: {id: string}) =>
			Effect.promise(async () => {
				const story = this.db.select().from(schema.story).where(eq(schema.story.id, id)).get();
				if (!story) return null;

				const tagsByStory = this.getTagsForStories([id]);
				return {
					id: story.id,
					url: story.url,
					title: story.title,
					description: story.description,
					createdAt: story.createdAt.toISOString(),
					tags: tagsByStory.get(id) ?? [],
				};
			}),

		listStories: ({first, after}: {first?: number; after?: string}) =>
			Effect.promise(async () => {
				const limit = first ?? 20;

				let query = this.db.select().from(schema.story).orderBy(desc(schema.story.id));
				if (after) {
					query = query.where(lt(schema.story.id, after)) as typeof query;
				}

				const countResult = this.db.select({count: sql<number>`count(*)`}).from(schema.story).get();
				const totalCount = countResult?.count ?? 0;

				const dbStories = query.limit(limit + 1).all();
				const hasNextPage = dbStories.length > limit;
				const edges = dbStories.slice(0, limit);

				// Fetch tags for all stories in one query
				const tagsByStory = this.getTagsForStories(edges.map((s) => s.id));

				return {
					stories: edges.map((s) => ({
						id: s.id,
						url: s.url,
						title: s.title,
						description: s.description,
						createdAt: s.createdAt.toISOString(),
						tags: tagsByStory.get(s.id) ?? [],
					})),
					hasNextPage,
					endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
					totalCount,
				};
			}),

		listStoriesByTag: ({tagId, first, after}: {tagId: string; first?: number; after?: string}) =>
			Effect.promise(async () => {
				const limit = first ?? 20;

				// Build where condition
				const whereCondition = after
					? and(eq(schema.storyTag.tagId, tagId), lt(schema.storyTag.storyId, after))
					: eq(schema.storyTag.tagId, tagId);

				// Get story IDs for this tag, ordered by story ID descending
				const storyIds = this.db
					.select({storyId: schema.storyTag.storyId})
					.from(schema.storyTag)
					.where(whereCondition)
					.orderBy(desc(schema.storyTag.storyId))
					.limit(limit + 1)
					.all();

				// Count total stories with this tag
				const countResult = this.db
					.select({count: sql<number>`count(*)`})
					.from(schema.storyTag)
					.where(eq(schema.storyTag.tagId, tagId))
					.get();
				const totalCount = countResult?.count ?? 0;

				const hasNextPage = storyIds.length > limit;
				const paginatedIds = storyIds.slice(0, limit).map((r) => r.storyId);

				if (paginatedIds.length === 0) {
					return {
						stories: [],
						hasNextPage: false,
						endCursor: null,
						totalCount,
					};
				}

				// Fetch the actual stories
				const stories = this.db
					.select()
					.from(schema.story)
					.where(inArray(schema.story.id, paginatedIds))
					.all();

				// Sort stories to match the order from storyTag query
				const storyMap = new Map(stories.map((s) => [s.id, s]));
				const orderedStories = paginatedIds
					.map((id) => storyMap.get(id))
					.filter((s): s is NonNullable<typeof s> => s !== undefined);

				// Fetch tags for all stories in one query
				const tagsByStory = this.getTagsForStories(paginatedIds);

				return {
					stories: orderedStories.map((s) => ({
						id: s.id,
						url: s.url,
						title: s.title,
						description: s.description,
						createdAt: s.createdAt.toISOString(),
						tags: tagsByStory.get(s.id) ?? [],
					})),
					hasNextPage,
					endCursor:
						orderedStories.length > 0 ? orderedStories[orderedStories.length - 1].id : null,
					totalCount,
				};
			}),

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
			Effect.gen(this, function* () {
				// Validate URL format
				try {
					new URL(url);
				} catch {
					return yield* Effect.fail(new InvalidUrlError({url}));
				}

				return yield* Effect.promise(async () => {
					const result = this.db
						.insert(schema.story)
						.values({url, normalizedUrl: getNormalizedUrl(url), title, description})
						.returning()
						.get();

					// Tag the story if tagIds provided
					if (tagIds && tagIds.length > 0) {
						const existingTags = this.db
							.select({id: schema.tag.id})
							.from(schema.tag)
							.where(inArray(schema.tag.id, [...tagIds]))
							.all();
						const validTagIds = tagIds.filter((id) => existingTags.some((t) => t.id === id));

						if (validTagIds.length > 0) {
							this.db
								.insert(schema.storyTag)
								.values(validTagIds.map((tagId) => ({storyId: result.id, tagId})))
								.onConflictDoNothing()
								.run();
						}
					}

					// Fetch tags for the created story
					const tagsByStory = this.getTagsForStories([result.id]);

					return {
						id: result.id,
						url: result.url,
						title: result.title,
						description: result.description,
						createdAt: result.createdAt.toISOString(),
						tags: tagsByStory.get(result.id) ?? [],
					};
				});
			}),

		updateStory: ({
			id,
			title,
			description,
			tagIds,
		}: {
			id: string;
			title?: string;
			description?: string | null;
			tagIds?: readonly string[];
		}) =>
			Effect.promise(async () => {
				const existing = this.db.select().from(schema.story).where(eq(schema.story.id, id)).get();
				if (!existing) return null;

				// Build the set object with only provided fields
				const setFields: {title?: string; description?: string | null} = {};
				if (title !== undefined) setFields.title = title;
				if (description !== undefined) setFields.description = description;

				let story = existing;
				if (Object.keys(setFields).length > 0) {
					story = this.db
						.update(schema.story)
						.set(setFields)
						.where(eq(schema.story.id, id))
						.returning()
						.get();
				}

				// Update tags if provided
				if (tagIds !== undefined) {
					// Get current tags
					const currentTags = this.db
						.select({tagId: schema.storyTag.tagId})
						.from(schema.storyTag)
						.where(eq(schema.storyTag.storyId, id))
						.all();
					const currentIds = new Set(currentTags.map((t) => t.tagId));
					const newIds = new Set(tagIds);

					// Remove old tags
					const toRemove = [...currentIds].filter((tid) => !newIds.has(tid));
					if (toRemove.length > 0) {
						this.db
							.delete(schema.storyTag)
							.where(and(eq(schema.storyTag.storyId, id), inArray(schema.storyTag.tagId, toRemove)))
							.run();
					}

					// Add new tags
					const toAdd = [...newIds].filter((tid) => !currentIds.has(tid));
					if (toAdd.length > 0) {
						// Verify tags exist
						const existingTags = this.db
							.select({id: schema.tag.id})
							.from(schema.tag)
							.where(inArray(schema.tag.id, toAdd))
							.all();
						const validTagIds = toAdd.filter((tid) => existingTags.some((t) => t.id === tid));

						if (validTagIds.length > 0) {
							this.db
								.insert(schema.storyTag)
								.values(validTagIds.map((tagId) => ({storyId: id, tagId})))
								.onConflictDoNothing()
								.run();
						}
					}
				}

				// Fetch tags for the updated story
				const tagsByStory = this.getTagsForStories([id]);

				return {
					id: story.id,
					url: story.url,
					title: story.title,
					description: story.description,
					createdAt: story.createdAt.toISOString(),
					tags: tagsByStory.get(id) ?? [],
				};
			}),

		deleteStory: ({id}: {id: string}) =>
			Effect.promise(async () => {
				const existing = this.db.select().from(schema.story).where(eq(schema.story.id, id)).get();
				if (!existing) return {deleted: false};

				// Delete tag associations first
				this.db.delete(schema.storyTag).where(eq(schema.storyTag.storyId, id)).run();
				// Then delete story
				this.db.delete(schema.story).where(eq(schema.story.id, id)).run();

				return {deleted: true};
			}),

		listTags: () =>
			Effect.promise(async () => {
				// Get tags with story counts using a subquery
				const tags = this.db
					.select({
						id: schema.tag.id,
						name: schema.tag.name,
						color: schema.tag.color,
						createdAt: schema.tag.createdAt,
						storyCount: sql<number>`(
							SELECT COUNT(*) FROM ${schema.storyTag}
							WHERE ${schema.storyTag.tagId} = ${schema.tag.id}
						)`,
					})
					.from(schema.tag)
					.all();
				return tags.map((tag) => ({
					id: tag.id,
					name: tag.name,
					color: tag.color,
					createdAt: tag.createdAt.toISOString(),
					storyCount: tag.storyCount,
				}));
			}),

		createTag: ({name, color}: {name: string; color: string}) =>
			Effect.promise(async () => {
				// Validate tag name
				const nameValidation = validateTagName(name);
				if (!nameValidation.valid) {
					throw new InvalidTagNameError({name, reason: nameValidation.reason});
				}

				// Validate color format
				if (!isValidHexColor(color)) {
					throw new InvalidTagColorError({color});
				}

				// Check uniqueness (case-insensitive)
				const existing = this.db
					.select()
					.from(schema.tag)
					.where(sql`lower(${schema.tag.name}) = lower(${name})`)
					.get();

				if (existing) {
					throw new TagNameExistsError({tagName: name});
				}

				const tag = this.db
					.insert(schema.tag)
					.values({name, color: color.toLowerCase()})
					.returning()
					.get();

				return {
					id: tag.id,
					name: tag.name,
					color: tag.color,
					createdAt: tag.createdAt.toISOString(),
					storyCount: 0, // New tags have no stories
				};
			}),

		updateTag: ({id, name, color}: {id: string; name?: string; color?: string}) =>
			Effect.promise(async () => {
				// Validate tag name if provided
				if (name) {
					const nameValidation = validateTagName(name);
					if (!nameValidation.valid) {
						throw new InvalidTagNameError({name, reason: nameValidation.reason});
					}
				}

				// Validate color format if provided
				if (color && !isValidHexColor(color)) {
					throw new InvalidTagColorError({color});
				}

				const existing = this.db.select().from(schema.tag).where(eq(schema.tag.id, id)).get();
				if (!existing) return null;

				// Helper to get story count for a tag
				const getStoryCount = () => {
					const result = this.db
						.select({count: sql<number>`count(*)`})
						.from(schema.storyTag)
						.where(eq(schema.storyTag.tagId, id))
						.get();
					return result?.count ?? 0;
				};

				const updateValues: {name?: string; color?: string} = {};
				if (name) updateValues.name = name;
				if (color) updateValues.color = color.toLowerCase();

				// If no updates provided, return existing tag unchanged
				if (Object.keys(updateValues).length === 0) {
					return {
						id: existing.id,
						name: existing.name,
						color: existing.color,
						createdAt: existing.createdAt.toISOString(),
						storyCount: getStoryCount(),
					};
				}

				// If updating name, check uniqueness (excluding current tag)
				if (name) {
					const duplicate = this.db
						.select()
						.from(schema.tag)
						.where(sql`lower(${schema.tag.name}) = lower(${name}) AND ${schema.tag.id} != ${id}`)
						.get();

					if (duplicate) {
						throw new TagNameExistsError({tagName: name});
					}
				}

				const tag = this.db
					.update(schema.tag)
					.set(updateValues)
					.where(eq(schema.tag.id, id))
					.returning()
					.get();

				return {
					id: tag.id,
					name: tag.name,
					color: tag.color,
					createdAt: tag.createdAt.toISOString(),
					storyCount: getStoryCount(),
				};
			}),

		deleteTag: ({id}: {id: string}) =>
			Effect.promise(async () => {
				const existing = this.db.select().from(schema.tag).where(eq(schema.tag.id, id)).get();
				if (!existing) return {deleted: false};

				// FK cascade will automatically delete storyTag associations
				this.db.delete(schema.tag).where(eq(schema.tag.id, id)).run();

				return {deleted: true};
			}),

		getTagsForStory: ({storyId}: {storyId: string}) =>
			Effect.promise(async () => {
				const results = this.db
					.select({
						id: schema.tag.id,
						name: schema.tag.name,
						color: schema.tag.color,
						createdAt: schema.tag.createdAt,
						storyCount: sql<number>`(
							SELECT COUNT(*) FROM ${schema.storyTag} st
							WHERE st.tag_id = ${schema.tag.id}
						)`,
					})
					.from(schema.storyTag)
					.innerJoin(schema.tag, eq(schema.storyTag.tagId, schema.tag.id))
					.where(eq(schema.storyTag.storyId, storyId))
					.all();

				return results.map((tag) => ({
					id: tag.id,
					name: tag.name,
					color: tag.color,
					createdAt: tag.createdAt.toISOString(),
					storyCount: tag.storyCount,
				}));
			}),

		setStoryTags: ({storyId, tagIds}: {storyId: string; tagIds: readonly string[]}) =>
			Effect.promise(async () => {
				// Get current tags
				const currentTags = this.db
					.select({tagId: schema.storyTag.tagId})
					.from(schema.storyTag)
					.where(eq(schema.storyTag.storyId, storyId))
					.all();
				const currentIds = new Set(currentTags.map((t) => t.tagId));
				const newIds = new Set(tagIds);

				// Remove old tags
				const toRemove = [...currentIds].filter((id) => !newIds.has(id));
				if (toRemove.length > 0) {
					this.db
						.delete(schema.storyTag)
						.where(
							and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, toRemove)),
						)
						.run();
				}

				// Add new tags
				const toAdd = [...newIds].filter((id) => !currentIds.has(id));
				if (toAdd.length > 0) {
					// Verify tags exist
					const existingTags = this.db
						.select({id: schema.tag.id})
						.from(schema.tag)
						.where(inArray(schema.tag.id, toAdd))
						.all();
					const validTagIds = toAdd.filter((id) => existingTags.some((t) => t.id === id));

					if (validTagIds.length > 0) {
						this.db
							.insert(schema.storyTag)
							.values(validTagIds.map((tagId) => ({storyId, tagId})))
							.onConflictDoNothing()
							.run();
					}
				}

				return {success: true};
			}),

		fetchUrlMetadata: ({url}: {url: string}) =>
			Effect.promise(async () => {
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

				try {
					// Use normalized URL as DO key for deduplication
					const normalizedUrl = getNormalizedUrl(url);
					const parserId = this.env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
					const parser = this.env.WEB_PAGE_PARSER.get(parserId);

					await parser.init(url);
					const metadata = await parser.getMetadata();

					return {
						title: metadata.title || null,
						description: metadata.description || null,
						error: null,
					};
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to fetch metadata";
					return {title: null, description: null, error: message};
				}
			}),
	};

	// Layer provides handlers + JSON serialization + Scope
	private handlerLayer = Layer.mergeAll(
		LibraryRpcs.toLayer(this.handlers),
		RpcSerialization.layerJson,
		Layer.scope,
	);

	// ManagedRuntime for running effects with the handler layer
	private runtime = ManagedRuntime.make(this.handlerLayer);

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	async fetch(request: Request): Promise<Response> {
		// Build the full effect: get httpApp, provide request, run, convert response
		const program = Effect.gen(function* () {
			const httpApp = yield* RpcServer.toHttpApp(LibraryRpcs);
			const response = yield* httpApp.pipe(
				Effect.provideService(
					HttpServerRequest.HttpServerRequest,
					HttpServerRequest.fromWeb(request),
				),
			);
			return HttpServerResponse.toWeb(response);
		});

		return this.runtime.runPromise(program);
	}
}
