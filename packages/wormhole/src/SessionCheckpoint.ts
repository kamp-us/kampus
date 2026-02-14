/**
 * Checkpoint schema for persisting session state to DO storage.
 *
 * @since 0.0.2
 */
import {Schema} from "effect";

/**
 * @since 0.0.2
 * @category models
 */
export class SessionCheckpoint extends Schema.Class<SessionCheckpoint>("SessionCheckpoint")({
	id: Schema.String,
	name: Schema.NullOr(Schema.String),
	cwd: Schema.NullOr(Schema.String),
	createdAt: Schema.Number,
	buffer: Schema.Struct({
		entries: Schema.Array(Schema.String),
		totalBytes: Schema.Number,
		capacity: Schema.Number,
	}),
}) {}
