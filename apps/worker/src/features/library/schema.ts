import {Data, Schema} from "effect";

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

export class InvalidTagNameError extends Data.TaggedError("InvalidTagNameError")<{
	readonly name: string;
	readonly reason: string;
}> {
	get message() {
		return `Invalid tag name "${this.name}": ${this.reason}`;
	}
}

// Validation helpers
const HEX_COLOR_REGEX = /^[0-9a-fA-F]{6}$/;
export function isValidHexColor(color: string): boolean {
	return HEX_COLOR_REGEX.test(color);
}

const MAX_TAG_NAME_LENGTH = 50;

export function validateTagName(name: string): {valid: true} | {valid: false; reason: string} {
	const trimmed = name.trim();

	if (trimmed.length === 0) {
		return {valid: false, reason: "Tag name cannot be empty"};
	}

	if (trimmed.length > MAX_TAG_NAME_LENGTH) {
		return {valid: false, reason: `Tag name cannot exceed ${MAX_TAG_NAME_LENGTH} characters`};
	}

	if (trimmed !== name) {
		return {valid: false, reason: "Tag name cannot have leading or trailing whitespace"};
	}

	return {valid: true};
}
