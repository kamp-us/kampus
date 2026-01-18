import {Schema} from "effect";

export class FetchTimeoutError extends Schema.TaggedError<FetchTimeoutError>()(
	"FetchTimeoutError",
	{url: Schema.String},
) {}

export class FetchHttpError extends Schema.TaggedError<FetchHttpError>()(
	"FetchHttpError",
	{url: Schema.String, status: Schema.Number},
) {}

export class FetchNetworkError extends Schema.TaggedError<FetchNetworkError>()(
	"FetchNetworkError",
	{url: Schema.String, message: Schema.String},
) {}

export class NotReadableError extends Schema.TaggedError<NotReadableError>()(
	"NotReadableError",
	{url: Schema.String},
) {}

export class ParseError extends Schema.TaggedError<ParseError>()(
	"ParseError",
	{url: Schema.String, message: Schema.String},
) {}

export class InvalidProtocolError extends Schema.TaggedError<InvalidProtocolError>()(
	"InvalidProtocolError",
	{url: Schema.String, protocol: Schema.String},
) {}
