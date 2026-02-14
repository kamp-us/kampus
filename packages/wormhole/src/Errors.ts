import {Schema} from "effect";

/**
 * @since 0.0.1
 * @category errors
 */
export class PtySpawnError extends Schema.TaggedError<PtySpawnError>()("PtySpawnError", {
	shell: Schema.String,
	cause: Schema.Defect,
}) {}

/**
 * @since 0.0.1
 * @category errors
 */
export class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>()(
	"SessionNotFoundError",
	{
		sessionId: Schema.String,
	},
) {}

/**
 * @since 0.0.2
 * @category errors
 */
export class ChannelExhaustedError extends Schema.TaggedError<ChannelExhaustedError>()(
	"ChannelExhaustedError",
	{
		maxChannels: Schema.Number,
	},
) {}
