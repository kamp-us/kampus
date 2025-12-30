import {Data, Schema} from "effect";

// we need to use Schema.Struct instead of Schema.Class because durable objects
// cannot return class instances
export const PageMetadata = Schema.Struct({
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
});

// Tag types
export const Tag = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.String,
	createdAt: Schema.Date,
});
export type Tag = Schema.Schema.Type<typeof Tag>;

export const CreateTagInput = Schema.Struct({
	name: Schema.String.pipe(Schema.minLength(1)),
	color: Schema.String.pipe(Schema.pattern(/^[0-9a-fA-F]{6}$/)),
});
export type CreateTagInput = Schema.Schema.Type<typeof CreateTagInput>;

export const UpdateTagInput = Schema.Struct({
	id: Schema.String,
	name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
	color: Schema.optional(Schema.String.pipe(Schema.pattern(/^[0-9a-fA-F]{6}$/))),
});
export type UpdateTagInput = Schema.Schema.Type<typeof UpdateTagInput>;

// Tag errors
export class TagNameExistsError extends Data.TaggedError("TagNameExistsError")<{
	readonly tagName: string;
}> {
	get message() {
		return `Tag name already exists: ${this.tagName}`;
	}
}

export class InvalidTagColorError extends Data.TaggedError("InvalidTagColorError")<{
	readonly color: string;
}> {
	get message() {
		return `Invalid color format: ${this.color}. Expected 6-digit hex code (e.g., "ff5733").`;
	}
}

// Validation helpers
const HEX_COLOR_REGEX = /^[0-9a-fA-F]{6}$/;
export function isValidHexColor(color: string): boolean {
	return HEX_COLOR_REGEX.test(color);
}
