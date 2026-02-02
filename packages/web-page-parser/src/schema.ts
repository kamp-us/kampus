import {Schema} from "effect";

export const PageMetadata = Schema.Struct({
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
});

export type PageMetadata = typeof PageMetadata.Type;

export const ReaderContent = Schema.Struct({
	title: Schema.String,
	content: Schema.String,
	textContent: Schema.String,
	excerpt: Schema.NullOr(Schema.String),
	byline: Schema.NullOr(Schema.String),
	siteName: Schema.NullOr(Schema.String),
	wordCount: Schema.Number,
	readingTimeMinutes: Schema.Number,
});

export type ReaderContent = typeof ReaderContent.Type;

export const ExtractionStrategy = Schema.NullOr(
	Schema.Literal("readability", "selector"),
);

export type ExtractionStrategy = typeof ExtractionStrategy.Type;

export const ReaderResult = Schema.Struct({
	readable: Schema.Boolean,
	metadata: Schema.NullOr(PageMetadata),
	content: Schema.NullOr(ReaderContent),
	strategy: ExtractionStrategy,
	error: Schema.NullOr(Schema.String),
});

export type ReaderResult = typeof ReaderResult.Type;
