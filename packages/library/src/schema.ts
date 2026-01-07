import {Schema} from "effect";

// Core entities

export const Story = Schema.Struct({
	id: Schema.String,
	url: Schema.String,
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
});
export type Story = typeof Story.Type;

export const Tag = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.String,
	createdAt: Schema.String,
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
