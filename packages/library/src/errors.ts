import {Schema} from "effect";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
	"UnauthorizedError",
	{},
) {}

export class StoryNotFoundError extends Schema.TaggedError<StoryNotFoundError>()(
	"StoryNotFoundError",
	{storyId: Schema.String},
) {}

export class TagNotFoundError extends Schema.TaggedError<TagNotFoundError>()("TagNotFoundError", {
	tagId: Schema.String,
}) {}

export class TagNameExistsError extends Schema.TaggedError<TagNameExistsError>()(
	"TagNameExistsError",
	{tagName: Schema.String},
) {}

export class InvalidTagNameError extends Schema.TaggedError<InvalidTagNameError>()(
	"InvalidTagNameError",
	{message: Schema.String},
) {}

export class InvalidTagColorError extends Schema.TaggedError<InvalidTagColorError>()(
	"InvalidTagColorError",
	{color: Schema.String},
) {}

export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()("InvalidUrlError", {
	url: Schema.String,
}) {}
