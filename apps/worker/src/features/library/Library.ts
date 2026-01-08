import {DurableObject} from "cloudflare:workers";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {LibraryRpcs} from "@kampus/library";
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

	// Effect RPC handlers - all business logic lives here
	private handlers = {
		getStory: ({id}: {id: string}) =>
			Effect.promise(async () => {
				const story = this.db.select().from(schema.story).where(eq(schema.story.id, id)).get();
				if (!story) return null;
				return {
					id: story.id,
					url: story.url,
					title: story.title,
					description: story.description,
					createdAt: story.createdAt.toISOString(),
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

				return {
					stories: edges.map((s) => ({
						id: s.id,
						url: s.url,
						title: s.title,
						description: s.description,
						createdAt: s.createdAt.toISOString(),
					})),
					hasNextPage,
					endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
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
			Effect.promise(async () => {
				// Validate URL format
				try {
					new URL(url);
				} catch {
					throw new Error("Invalid URL format");
				}

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

				return {
					id: result.id,
					url: result.url,
					title: result.title,
					description: result.description,
					createdAt: result.createdAt.toISOString(),
				};
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

				return {
					id: story.id,
					url: story.url,
					title: story.title,
					description: story.description,
					createdAt: story.createdAt.toISOString(),
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
				const tags = this.db.select().from(schema.tag).all();
				return tags.map((tag) => ({
					id: tag.id,
					name: tag.name,
					color: tag.color,
					createdAt: tag.createdAt.toISOString(),
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
