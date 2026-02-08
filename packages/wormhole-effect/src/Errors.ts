import {Schema} from "effect";

/**
 * @since 0.0.1
 * @category errors
 */
export class PtySpawnError extends Schema.TaggedError<PtySpawnError>()("PtySpawnError", {
	shell: Schema.String,
	cause: Schema.Defect,
}) {}
