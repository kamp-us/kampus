import {Request} from "effect";
import type {Story, Tag} from "@kampus/library";

/**
 * Request for single story lookup.
 * Used by StoryResolver for batched data loading.
 *
 * @example
 * ```ts
 * const story = yield* Effect.request(GetStory({id: "story_123"}), StoryResolver);
 * ```
 */
export interface GetStory extends Request.Request<Story | null, never> {
	readonly _tag: "GetStory";
	readonly id: string;
}

export const GetStory = Request.tagged<GetStory>("GetStory");

/**
 * Request for single tag lookup.
 * Used by TagResolver for batched data loading.
 *
 * @example
 * ```ts
 * const tag = yield* Effect.request(GetTag({id: "tag_123"}), TagResolver);
 * ```
 */
export interface GetTag extends Request.Request<Tag | null, never> {
	readonly _tag: "GetTag";
	readonly id: string;
}

export const GetTag = Request.tagged<GetTag>("GetTag");
