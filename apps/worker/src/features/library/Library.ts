import {DurableObject} from "cloudflare:workers";
import {and, desc, eq, inArray, lt, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import {getNormalizedUrl} from "./getNormalizedUrl";
import {InvalidTagColorError, isValidHexColor, TagNameExistsError} from "./schema";

// keyed by user id
export class Library extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
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

	async updateStory(id: string, updates: {title?: string}) {
		if (!updates.title) {
			return await this.getStory(id);
		}

		return await this.db.transaction(async (tx) => {
			const existing = await tx.select().from(schema.story).where(eq(schema.story.id, id)).get();
			if (!existing) return null;

			const [story] = await tx
				.update(schema.story)
				.set({title: updates.title})
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
			};
		}

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
