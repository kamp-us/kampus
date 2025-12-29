import {Schema} from "effect";

// we need to use Schema.Struct instead of Schema.Class because durable objects
// cannot return class instances
export const PageMetadata = Schema.Struct({
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
});
