import {DurableObject} from "cloudflare:workers";
import {and, desc, eq, inArray, lt, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
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

// RPC message types (compatible with @effect/rpc)
interface RpcRequest {
	_tag: "Request";
	id: string;
	tag: string;
	payload: unknown;
	headers: ReadonlyArray<[string, string]>;
}

interface RpcResponseExit {
	_tag: "Exit";
	requestId: string;
	exit:
		| {_tag: "Success"; value: unknown}
		| {_tag: "Failure"; cause: {_tag: "Fail"; error: unknown}};
}

// keyed by user id
export class Library extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	// RPC fetch handler - dispatches to appropriate methods
	async fetch(request: Request): Promise<Response> {
		try {
			const body = await request.json();
			const rpcRequest = body as RpcRequest;

			if (rpcRequest._tag !== "Request") {
				return new Response(JSON.stringify([]), {
					headers: {"Content-Type": "application/json"},
				});
			}

			const response = await this.handleRpc(rpcRequest);
			return new Response(JSON.stringify([response]), {
				headers: {"Content-Type": "application/json"},
			});
		} catch (error) {
			console.error("RPC error:", error);
			return new Response(JSON.stringify({error: "Internal server error"}), {
				status: 500,
				headers: {"Content-Type": "application/json"},
			});
		}
	}

	private async handleRpc(req: RpcRequest): Promise<RpcResponseExit> {
		const {id, tag, payload} = req;
		const p = payload as Record<string, unknown>;

		try {
			let result: unknown;

			switch (tag) {
				case "getStory":
					result = await this.getStory(p.id as string);
					break;
				case "listStories":
					result = await this.listStoriesRpc(p);
					break;
				case "createStory":
					result = await this.createStory({
						url: p.url as string,
						title: p.title as string,
						description: p.description as string | undefined,
					});
					if (p.tagIds && Array.isArray(p.tagIds) && p.tagIds.length > 0) {
						await this.tagStory((result as {id: string}).id, p.tagIds as string[]);
					}
					break;
				case "updateStory": {
					const storyResult = await this.updateStory(p.id as string, {
						title: p.title as string | undefined,
						description: p.description as string | null | undefined,
					});
					if (storyResult && p.tagIds !== undefined) {
						await this.setStoryTags(p.id as string, (p.tagIds ?? []) as string[]);
					}
					result = storyResult;
					break;
				}
				case "deleteStory":
					result = {deleted: await this.deleteStory(p.id as string)};
					break;
				case "listTags":
					result = await this.listTagsRpc();
					break;
				case "createTag":
					result = await this.createTagRpc(p.name as string, p.color as string);
					break;
				case "updateTag":
					result = await this.updateTagRpc(p.id as string, {
						name: p.name as string | undefined,
						color: p.color as string | undefined,
					});
					break;
				case "deleteTag":
					await this.deleteTag(p.id as string);
					result = {deleted: true};
					break;
				case "getTagsForStory":
					result = await this.getTagsForStoryRpc(p.storyId as string);
					break;
				case "setStoryTags":
					await this.setStoryTags(p.storyId as string, p.tagIds as string[]);
					result = {success: true};
					break;
				default:
					throw new Error(`Unknown RPC method: ${tag}`);
			}

			return {
				_tag: "Exit",
				requestId: id,
				exit: {_tag: "Success", value: result},
			};
		} catch (error) {
			return {
				_tag: "Exit",
				requestId: id,
				exit: {
					_tag: "Failure",
					cause: {
						_tag: "Fail",
						error:
							error instanceof Error
								? {_tag: error.name, message: error.message}
								: {_tag: "Error", message: String(error)},
					},
				},
			};
		}
	}

	// RPC-specific methods that return ISO date strings
	private async listStoriesRpc(options?: {first?: number; after?: string}) {
		const result = await this.listStories(options);
		return {
			stories: result.edges,
			hasNextPage: result.hasNextPage,
			endCursor: result.endCursor,
			totalCount: result.totalCount,
		};
	}

	private async listTagsRpc() {
		const tags = await this.listTags();
		return tags.map((t) => ({
			...t,
			createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
		}));
	}

	private async createTagRpc(name: string, color: string) {
		const tag = await this.createTag(name, color);
		return {
			...tag,
			createdAt: tag.createdAt instanceof Date ? tag.createdAt.toISOString() : tag.createdAt,
		};
	}

	private async updateTagRpc(id: string, updates: {name?: string; color?: string}) {
		const tag = await this.updateTag(id, updates);
		if (!tag) return null;
		return {
			...tag,
			createdAt: tag.createdAt instanceof Date ? tag.createdAt.toISOString() : tag.createdAt,
		};
	}

	private async getTagsForStoryRpc(storyId: string) {
		const tags = await this.getTagsForStory(storyId);
		return tags.map((t) => ({
			...t,
			createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
		}));
	}

	async init(owner: string) {
		await this.ctx.storage.put("owner", owner);
	}

	async createStory(options: {url: string; title: string; description?: string}) {
		const {url, title, description} = options;

		// Validate URL format
		try {
			new URL(url);
		} catch {
			throw new Error("Invalid URL format");
		}

		const [story] = await this.db
			.insert(schema.story)
			.values({url, normalizedUrl: getNormalizedUrl(url), title, description})
			.returning();

		return {
			...story,
			createdAt: story.createdAt.toISOString(),
		};
	}

	// Story CRUD methods

	async listStories(options?: {first?: number; after?: string}) {
		const limit = options?.first ?? 20;

		// Build base query - order by ID (ULIDx IDs are time-sortable)
		let query = this.db.select().from(schema.story).orderBy(desc(schema.story.id));

		// Apply cursor if provided
		if (options?.after) {
			query = query.where(lt(schema.story.id, options.after)) as typeof query;
		}

		// Get total count (independent of pagination)
		const countResult = await this.db.select({count: sql<number>`count(*)`}).from(schema.story);
		const totalCount = countResult[0]?.count ?? 0;

		const dbStories = await query.limit(limit + 1).all();
		const hasNextPage = dbStories.length > limit;
		const edges = dbStories.slice(0, limit);

		// Convert Date objects to ISO strings for RPC serialization
		return {
			edges: edges.map((s) => ({
				...s,
				createdAt: s.createdAt.toISOString(),
			})),
			hasNextPage,
			endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
			totalCount,
		};
	}

	async getStory(id: string) {
		const story = await this.db.select().from(schema.story).where(eq(schema.story.id, id)).get();

		if (!story) return null;

		// Convert Date to ISO string for RPC
		return {
			...story,
			createdAt: story.createdAt.toISOString(),
		};
	}

	async updateStory(id: string, updates: {title?: string; description?: string | null}) {
		// If no updates provided, just return the existing story
		if (updates.title === undefined && updates.description === undefined) {
			return await this.getStory(id);
		}

		return await this.db.transaction(async (tx) => {
			const existing = await tx.select().from(schema.story).where(eq(schema.story.id, id)).get();
			if (!existing) return null;

			// Build the set object with only provided fields
			const setFields: {title?: string; description?: string | null} = {};
			if (updates.title !== undefined) setFields.title = updates.title;
			if (updates.description !== undefined) setFields.description = updates.description;

			const [story] = await tx
				.update(schema.story)
				.set(setFields)
				.where(eq(schema.story.id, id))
				.returning();

			// Convert Date to ISO string for RPC
			return {
				...story,
				createdAt: story.createdAt.toISOString(),
			};
		});
	}

	async deleteStory(id: string) {
		return await this.db.transaction(async (tx) => {
			const existing = await tx.select().from(schema.story).where(eq(schema.story.id, id)).get();
			if (!existing) return false;

			// Delete tag associations first (cascade)
			await tx.delete(schema.storyTag).where(eq(schema.storyTag.storyId, id));
			// Then delete story
			await tx.delete(schema.story).where(eq(schema.story.id, id));

			return true;
		});
	}

	// Tag CRUD methods

	async createTag(name: string, color: string) {
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
		const existing = await this.db
			.select()
			.from(schema.tag)
			.where(sql`lower(${schema.tag.name}) = lower(${name})`)
			.get();

		if (existing) {
			throw new TagNameExistsError({tagName: name});
		}

		const [tag] = await this.db
			.insert(schema.tag)
			.values({name, color: color.toLowerCase()})
			.returning();

		return tag;
	}

	async getTag(id: string) {
		const tag = await this.db.select().from(schema.tag).where(eq(schema.tag.id, id)).get();

		return tag ?? null;
	}

	async listTags() {
		const tags = await this.db.select().from(schema.tag).all();

		return tags;
	}

	async updateTag(id: string, updates: {name?: string; color?: string}) {
		// Validate tag name if provided
		if (updates.name) {
			const nameValidation = validateTagName(updates.name);
			if (!nameValidation.valid) {
				throw new InvalidTagNameError({name: updates.name, reason: nameValidation.reason});
			}
		}

		// Validate color format if provided
		if (updates.color && !isValidHexColor(updates.color)) {
			throw new InvalidTagColorError({color: updates.color});
		}

		const existing = await this.getTag(id);

		if (!existing) {
			return null;
		}

		const updateValues: {name?: string; color?: string} = {};
		if (updates.name) updateValues.name = updates.name;
		if (updates.color) updateValues.color = updates.color.toLowerCase();

		// If no updates provided, return existing tag unchanged
		if (Object.keys(updateValues).length === 0) {
			return existing;
		}

		// If updating name, check uniqueness (excluding current tag)
		if (updates.name) {
			const duplicate = await this.db
				.select()
				.from(schema.tag)
				.where(
					sql`lower(${schema.tag.name}) = lower(${updates.name}) AND ${schema.tag.id} != ${id}`,
				)
				.get();

			if (duplicate) {
				throw new TagNameExistsError({tagName: updates.name});
			}
		}

		const [tag] = await this.db
			.update(schema.tag)
			.set(updateValues)
			.where(eq(schema.tag.id, id))
			.returning();

		return tag;
	}

	async deleteTag(id: string) {
		const existing = await this.getTag(id);

		if (!existing) {
			return;
		}

		// FK cascade will automatically delete storyTag associations
		await this.db.delete(schema.tag).where(eq(schema.tag.id, id));
	}

	// Story-Tag relationship methods

	async tagStory(storyId: string, tagIds: string[]) {
		if (tagIds.length === 0) {
			return;
		}

		// Verify story exists
		const story = await this.db
			.select()
			.from(schema.story)
			.where(eq(schema.story.id, storyId))
			.get();

		if (!story) {
			return;
		}

		// Verify all tags exist before creating associations
		const existingTags = await this.db
			.select({id: schema.tag.id})
			.from(schema.tag)
			.where(inArray(schema.tag.id, tagIds))
			.all();

		const existingTagIds = new Set(existingTags.map((t) => t.id));
		const validTagIds = tagIds.filter((id) => existingTagIds.has(id));

		// Batch insert with ON CONFLICT DO NOTHING for idempotency
		if (validTagIds.length > 0) {
			await this.db
				.insert(schema.storyTag)
				.values(validTagIds.map((tagId) => ({storyId, tagId})))
				.onConflictDoNothing();
		}
	}

	async untagStory(storyId: string, tagIds: string[]) {
		if (tagIds.length === 0) return;

		await this.db
			.delete(schema.storyTag)
			.where(and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, tagIds)));
	}

	async getTagsForStory(storyId: string) {
		const results = await this.db
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

		return results;
	}

	async getStoriesByTag(tagId: string) {
		const results = await this.db
			.select({
				id: schema.story.id,
				url: schema.story.url,
				normalizedUrl: schema.story.normalizedUrl,
				title: schema.story.title,
				description: schema.story.description,
				createdAt: schema.story.createdAt,
			})
			.from(schema.storyTag)
			.innerJoin(schema.story, eq(schema.storyTag.storyId, schema.story.id))
			.where(eq(schema.storyTag.tagId, tagId))
			.all();

		return results;
	}

	async getStoriesByTagName(tagName: string, options?: {first?: number; after?: string}) {
		const limit = options?.first ?? 20;

		// Find tag by name (case-insensitive)
		const tag = await this.db
			.select()
			.from(schema.tag)
			.where(sql`lower(${schema.tag.name}) = lower(${tagName})`)
			.get();

		if (!tag) {
			// Tag doesn't exist - return empty result
			return {
				edges: [],
				hasNextPage: false,
				endCursor: null,
				totalCount: 0,
			};
		}

		// Get total count for this tag (independent of pagination)
		const countResult = await this.db
			.select({count: sql<number>`count(*)`})
			.from(schema.storyTag)
			.where(eq(schema.storyTag.tagId, tag.id));
		const totalCount = countResult[0]?.count ?? 0;

		// Build where condition
		const whereCondition = options?.after
			? and(eq(schema.storyTag.tagId, tag.id), lt(schema.story.id, options.after))
			: eq(schema.storyTag.tagId, tag.id);

		// Query for stories with this tag, ordered by ID (ULIDx IDs are time-sortable)
		const dbStories = await this.db
			.select({
				id: schema.story.id,
				url: schema.story.url,
				normalizedUrl: schema.story.normalizedUrl,
				title: schema.story.title,
				description: schema.story.description,
				createdAt: schema.story.createdAt,
			})
			.from(schema.storyTag)
			.innerJoin(schema.story, eq(schema.storyTag.storyId, schema.story.id))
			.where(whereCondition)
			.orderBy(desc(schema.story.id))
			.limit(limit + 1)
			.all();

		const hasNextPage = dbStories.length > limit;
		const edges = dbStories.slice(0, limit);

		return {
			edges: edges.map((s) => ({
				...s,
				createdAt: s.createdAt.toISOString(),
			})),
			hasNextPage,
			endCursor: edges.length > 0 ? edges[edges.length - 1].id : null,
			totalCount,
		};
	}

	/**
	 * Atomically sets the tags for a story by computing the diff
	 * and using tagStory/untagStory internally.
	 */
	async setStoryTags(storyId: string, tagIds: string[]) {
		// Get current tags for this story
		const currentTags = await this.getTagsForStory(storyId);
		const currentIds = new Set(currentTags.map((t) => t.id));
		const newIds = new Set(tagIds);

		// Compute diff
		const toRemove = currentTags.filter((t) => !newIds.has(t.id)).map((t) => t.id);
		const toAdd = tagIds.filter((id) => !currentIds.has(id));

		// Apply changes using existing methods
		if (toRemove.length > 0) {
			await this.untagStory(storyId, toRemove);
		}
		if (toAdd.length > 0) {
			await this.tagStory(storyId, toAdd);
		}
	}
}
