import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import * as Errors from "./errors.js";
import {PaginationInput, StoriesPage, Story, Tag} from "./schema.js";

export const LibraryRpcs = RpcGroup.make(
	// Story operations
	Rpc.make("getStory", {
		payload: {id: Schema.String},
		success: Schema.NullOr(Story),
	}),

	Rpc.make("listStories", {
		payload: PaginationInput,
		success: StoriesPage,
	}),

	Rpc.make("createStory", {
		payload: {
			url: Schema.String,
			title: Schema.String,
			description: Schema.optional(Schema.String),
			tagIds: Schema.optional(Schema.Array(Schema.String)),
		},
		success: Story,
	}),

	Rpc.make("updateStory", {
		payload: {
			id: Schema.String,
			title: Schema.optional(Schema.String),
			description: Schema.optional(Schema.NullOr(Schema.String)),
			tagIds: Schema.optional(Schema.Array(Schema.String)),
		},
		success: Schema.NullOr(Story),
		error: Errors.StoryNotFoundError,
	}),

	Rpc.make("deleteStory", {
		payload: {id: Schema.String},
		success: Schema.Struct({deleted: Schema.Boolean}),
	}),

	// Tag operations
	Rpc.make("listTags", {
		payload: Schema.Void,
		success: Schema.Array(Tag),
	}),

	Rpc.make("createTag", {
		payload: {name: Schema.String, color: Schema.String},
		success: Tag,
		error: Schema.Union(
			Errors.TagNameExistsError,
			Errors.InvalidTagNameError,
			Errors.InvalidTagColorError,
		),
	}),

	Rpc.make("updateTag", {
		payload: {
			id: Schema.String,
			name: Schema.optional(Schema.String),
			color: Schema.optional(Schema.String),
		},
		success: Schema.NullOr(Tag),
		error: Schema.Union(
			Errors.TagNotFoundError,
			Errors.TagNameExistsError,
			Errors.InvalidTagNameError,
			Errors.InvalidTagColorError,
		),
	}),

	Rpc.make("deleteTag", {
		payload: {id: Schema.String},
		success: Schema.Struct({deleted: Schema.Boolean}),
	}),

	// Tag-Story relationships
	Rpc.make("getTagsForStory", {
		payload: {storyId: Schema.String},
		success: Schema.Array(Tag),
	}),

	Rpc.make("setStoryTags", {
		payload: {storyId: Schema.String, tagIds: Schema.Array(Schema.String)},
		success: Schema.Struct({success: Schema.Boolean}),
	}),
);

export type LibraryRpcs = typeof LibraryRpcs;
