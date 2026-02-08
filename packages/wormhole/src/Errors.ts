import {Schema} from "effect"

export class PtySpawnError extends Schema.TaggedError<PtySpawnError>()(
	"PtySpawnError",
	{
		shell: Schema.String,
		cause: Schema.Defect,
	},
) {}

export class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>()(
	"SessionNotFoundError",
	{
		sessionId: Schema.String,
	},
) {}
