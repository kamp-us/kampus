import {Either, Option, Schema} from "effect"

// --- Client → Server messages ---

export class AttachMessage extends Schema.Class<AttachMessage>("AttachMessage")({
	type: Schema.Literal("attach"),
	sessionId: Schema.NullOr(Schema.String),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

export class ResizeMessage extends Schema.Class<ResizeMessage>("ResizeMessage")({
	type: Schema.Literal("resize"),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

export class SessionListRequest extends Schema.Class<SessionListRequest>("SessionListRequest")({
	type: Schema.Literal("session_list_request"),
}) {}

export class SessionNewRequest extends Schema.Class<SessionNewRequest>("SessionNewRequest")({
	type: Schema.Literal("session_new"),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

export const ControlMessage = Schema.Union(AttachMessage, ResizeMessage, SessionListRequest, SessionNewRequest)
export type ControlMessage = typeof ControlMessage.Type

// --- Server → Client messages ---

export class SessionMessage extends Schema.Class<SessionMessage>("SessionMessage")({
	type: Schema.Literal("session"),
	sessionId: Schema.String,
}) {}

export class SessionListResponse extends Schema.Class<SessionListResponse>("SessionListResponse")({
	type: Schema.Literal("session_list"),
	sessions: Schema.Array(
		Schema.Struct({
			id: Schema.String,
			clientCount: Schema.Number,
		}),
	),
}) {}

export type ServerMessage = SessionMessage | SessionListResponse

// --- Parsing ---

const decodeControlMessage = Schema.decodeUnknownEither(ControlMessage)

/**
 * Parse a raw WebSocket message into a ControlMessage.
 * Returns Option.None for raw terminal input (non-JSON).
 * Returns Option.Some for valid control messages.
 * Silently drops invalid JSON.
 */
export const parseMessage = (data: string): Option.Option<ControlMessage> => {
	if (!data.startsWith("{")) return Option.none()

	let parsed: unknown
	try {
		parsed = JSON.parse(data)
	} catch {
		return Option.none()
	}

	return Either.match(decodeControlMessage(parsed), {
		onLeft: () => Option.none(),
		onRight: (msg) => Option.some(msg),
	})
}
