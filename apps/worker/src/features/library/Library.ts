import {DurableObject} from "cloudflare:workers";
import {and, desc, eq, inArray, lt, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {encodeGlobalId, NodeType} from "../../graphql/relay";
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
import type {LibraryEvent, StoryPayload, TagPayload} from "./subscription-types";

/** Maximum number of items per page for pagination */
const MAX_PAGE_SIZE = 100;

/** Maximum length for story fields to prevent oversized WebSocket payloads */
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

// keyed by user id
export class Library extends DurableObject<Env> {
	db = drizzle(this.ctx.storage, {schema});
	private ownerId: string | undefined = undefined;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
			this.ownerId = await this.ctx.storage.get<string>("owner");
		});
	}

	async init(owner: string) {
		// Idempotent - skip if already initialized
		if (this.ownerId) return;
		this.ownerId = owner;
		await this.ctx.storage.put("owner", owner);
	}

	// --- Subscription helpers ---

	private getUserChannel() {
		if (!this.ownerId) {
			throw new Error("Library has no owner");
		}
		const channelId = this.env.USER_CHANNEL.idFromName(this.ownerId);
		return this.env.USER_CHANNEL.get(channelId);
	}

	private async publishToLibrary(event: LibraryEvent): Promise<void> {
		try {
			const userChannel = this.getUserChannel();
			await userChannel.publish("library", event);
		} catch (error) {
			// Log but don't throw - mutation succeeded, broadcast is best-effort
			console.error("Failed to publish event:", error);
		}
	}

	private async publishLibraryChange(counts?: {stories?: number; tags?: number}): Promise<void> {
		// Use provided counts or query fresh counts
		const totalStories = counts?.stories ?? (await this.getStoryCount());
		const totalTags = counts?.tags ?? (await this.getTagCount());

		await this.publishToLibrary({
			type: "library:change",
			totalStories,
			totalTags,
		});
	}

	private async getStoryCount(): Promise<number> {
		const result = await this.db.select({count: sql<number>`count(*)`}).from(schema.story);
		return result[0]?.count ?? 0;
	}

	private async getTagCount(): Promise<number> {
		const result = await this.db.select({count: sql<number>`count(*)`}).from(schema.tag);
		return result[0]?.count ?? 0;
	}

	private toStoryPayload(story: {
		id: string;
		url: string;
		title: string;
		description?: string | null;
		createdAt: string;
	}): StoryPayload {
		return {
			id: encodeGlobalId(NodeType.Story, story.id),
			url: story.url,
			title: story.title,
			description: story.description ?? null,
			createdAt: story.createdAt,
		};
	}

	private toTagPayload(tag: {
		id: string;
		name: string;
		color: string;
		createdAt: Date;
	}): TagPayload {
		return {
			id: encodeGlobalId(NodeType.Tag, tag.id),
			name: tag.name,
			color: tag.color,
			createdAt: tag.createdAt.toISOString(),
		};
	}

	async createStory(options: {url: string; title: string; description?: string}) {
		const {url, title, description} = options;

		// Validate field lengths to prevent oversized payloads
		if (url.length > MAX_URL_LENGTH) {
			throw new Error("URL too long");
		}
		if (title.length > MAX_TITLE_LENGTH) {
			throw new Error("Title too long");
		}
		if (description && description.length > MAX_DESCRIPTION_LENGTH) {
			throw new Error("Description too long");
		}

		// Validate URL format
		try {
			new URL(url);
		} catch {
			throw new Error("Invalid URL format");
		}

		// Use transaction to ensure insert and count are atomic
		const result = await this.db.transaction(async (tx) => {
			const [story] = await tx
				.insert(schema.story)
				.values({url, normalizedUrl: getNormalizedUrl(url), title, description})
				.returning();

			// Get count within same transaction
			const countResult = await tx.select({count: sql<number>`count(*)`}).from(schema.story);
			const totalStories = countResult[0]?.count ?? 0;

			return {story, totalStories};
		});

		const storyResult = {
			...result.story,
			createdAt: result.story.createdAt.toISOString(),
		};

		// Publish events with accurate count
		await this.publishToLibrary({
			type: "story:create",
			story: this.toStoryPayload(storyResult),
		});
		await this.publishLibraryChange({stories: result.totalStories});

		return storyResult;
	}

	// Story CRUD methods

	async listStories(options?: {first?: number; after?: string}) {
		const limit = Math.min(options?.first ?? 20, MAX_PAGE_SIZE);

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

		// Validate field lengths
		if (updates.title !== undefined && updates.title.length > MAX_TITLE_LENGTH) {
			throw new Error("Title too long");
		}
		if (updates.description && updates.description.length > MAX_DESCRIPTION_LENGTH) {
			throw new Error("Description too long");
		}

		const storyResult = await this.db.transaction(async (tx) => {
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

		// Publish event if story was updated
		if (storyResult) {
			await this.publishToLibrary({
				type: "story:update",
				story: this.toStoryPayload(storyResult),
			});
		}

		return storyResult;
	}

	async deleteStory(id: string) {
		const result = await this.db.transaction(async (tx) => {
			const existing = await tx.select().from(schema.story).where(eq(schema.story.id, id)).get();
			if (!existing) return {deleted: false, totalStories: 0};

			// Delete tag associations first (cascade)
			await tx.delete(schema.storyTag).where(eq(schema.storyTag.storyId, id));
			// Then delete story
			await tx.delete(schema.story).where(eq(schema.story.id, id));

			// Get count within same transaction
			const countResult = await tx.select({count: sql<number>`count(*)`}).from(schema.story);
			const totalStories = countResult[0]?.count ?? 0;

			return {deleted: true, totalStories};
		});

		// Publish events if story was deleted
		if (result.deleted) {
			await this.publishToLibrary({
				type: "story:delete",
				deletedStoryId: encodeGlobalId(NodeType.Story, id),
			});
			await this.publishLibraryChange({stories: result.totalStories});
		}

		return result.deleted;
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

		// Publish events
		await this.publishToLibrary({
			type: "tag:create",
			tag: this.toTagPayload(tag),
		});
		await this.publishLibraryChange();

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

		// Publish event
		await this.publishToLibrary({
			type: "tag:update",
			tag: this.toTagPayload(tag),
		});

		return tag;
	}

	async deleteTag(id: string) {
		const existing = await this.getTag(id);

		if (!existing) {
			return;
		}

		// FK cascade will automatically delete storyTag associations
		await this.db.delete(schema.tag).where(eq(schema.tag.id, id));

		// Publish events
		await this.publishToLibrary({
			type: "tag:delete",
			deletedTagId: encodeGlobalId(NodeType.Tag, id),
		});
		await this.publishLibraryChange();
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

		// Verify all tags exist before creating associations - fetch full tag data
		const existingTags = await this.db
			.select()
			.from(schema.tag)
			.where(inArray(schema.tag.id, tagIds))
			.all();

		const existingTagIds = new Set(existingTags.map((t) => t.id));
		const validTagIds = tagIds.filter((id) => existingTagIds.has(id));
		const validTags = existingTags.filter((t) => validTagIds.includes(t.id));

		// Batch insert with ON CONFLICT DO NOTHING for idempotency
		if (validTagIds.length > 0) {
			await this.db
				.insert(schema.storyTag)
				.values(validTagIds.map((tagId) => ({storyId, tagId})))
				.onConflictDoNothing();

			// Publish event with full tag data
			await this.publishToLibrary({
				type: "story:tag",
				storyId: encodeGlobalId(NodeType.Story, storyId),
				tags: validTags.map((t) => this.toTagPayload(t)),
			});
		}
	}

	async untagStory(storyId: string, tagIds: string[]) {
		if (tagIds.length === 0) return;

		await this.db
			.delete(schema.storyTag)
			.where(and(eq(schema.storyTag.storyId, storyId), inArray(schema.storyTag.tagId, tagIds)));

		// Publish event
		await this.publishToLibrary({
			type: "story:untag",
			storyId: encodeGlobalId(NodeType.Story, storyId),
			tagIds: tagIds.map((id) => encodeGlobalId(NodeType.Tag, id)),
		});
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
		const limit = Math.min(options?.first ?? 20, MAX_PAGE_SIZE);

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
