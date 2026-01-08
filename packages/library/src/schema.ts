import {Schema} from "effect";

// Core entities

// Tag reference (without storyCount, for embedding in stories)
export const TagRef = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.String,
});
export type TagRef = typeof TagRef.Type;

export const Story = Schema.Struct({
	id: Schema.String,
	url: Schema.String,
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	tags: Schema.Array(TagRef),
});
export type Story = typeof Story.Type;

export const Tag = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.String,
	createdAt: Schema.String,
	storyCount: Schema.Int,
});
export type Tag = typeof Tag.Type;

// Pagination

export const PaginationInput = Schema.Struct({
	first: Schema.optional(Schema.Int.pipe(Schema.positive())),
	after: Schema.optional(Schema.String),
});
export type PaginationInput = typeof PaginationInput.Type;

export const StoriesPage = Schema.Struct({
	stories: Schema.Array(Story),
	hasNextPage: Schema.Boolean,
	endCursor: Schema.NullOr(Schema.String),
	totalCount: Schema.Int,
});
export type StoriesPage = typeof StoriesPage.Type;

// URL metadata
export const UrlMetadata = Schema.Struct({
	title: Schema.NullOr(Schema.String),
	description: Schema.NullOr(Schema.String),
	error: Schema.NullOr(Schema.String),
});
export type UrlMetadata = typeof UrlMetadata.Type;
