/**
 * WebSocket message protocol for wormhole sessions.
 *
 * @since 0.0.1
 */
import {Either, Option, Schema} from "effect";

// Client → Server

/** @since 0.0.1 @category models */
export class AttachMessage extends Schema.Class<AttachMessage>("AttachMessage")({
	type: Schema.Literal("attach"),
	sessionId: Schema.NullOr(Schema.String),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.1 @category models */
export class ResizeMessage extends Schema.Class<ResizeMessage>("ResizeMessage")({
	type: Schema.Literal("resize"),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.1 @category models */
export class SessionListRequest extends Schema.Class<SessionListRequest>("SessionListRequest")({
	type: Schema.Literal("session_list_request"),
}) {}

/** @since 0.0.1 @category models */
export class SessionNewRequest extends Schema.Class<SessionNewRequest>("SessionNewRequest")({
	type: Schema.Literal("session_new"),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.2 @category models */
export class SessionCreateRequest extends Schema.Class<SessionCreateRequest>("SessionCreateRequest")({
	type: Schema.Literal("session_create"),
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.2 @category models */
export class SessionAttachRequest extends Schema.Class<SessionAttachRequest>("SessionAttachRequest")({
	type: Schema.Literal("session_attach"),
	sessionId: Schema.String,
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.2 @category models */
export class SessionDetachRequest extends Schema.Class<SessionDetachRequest>("SessionDetachRequest")({
	type: Schema.Literal("session_detach"),
	sessionId: Schema.String,
}) {}

/** @since 0.0.2 @category models */
export class SessionResizeRequest extends Schema.Class<SessionResizeRequest>("SessionResizeRequest")({
	type: Schema.Literal("session_resize"),
	sessionId: Schema.String,
	cols: Schema.Number,
	rows: Schema.Number,
}) {}

/** @since 0.0.1 @category models */
export const ControlMessage = Schema.Union(
	AttachMessage,
	ResizeMessage,
	SessionListRequest,
	SessionNewRequest,
	SessionCreateRequest,
	SessionAttachRequest,
	SessionDetachRequest,
	SessionResizeRequest,
);

/** @since 0.0.1 @category models */
export type ControlMessage = typeof ControlMessage.Type;

// Server → Client

/** @since 0.0.1 @category models */
export class SessionMessage extends Schema.Class<SessionMessage>("SessionMessage")({
	type: Schema.Literal("session"),
	sessionId: Schema.String,
}) {}

/** @since 0.0.1 @category models */
export class SessionListResponse extends Schema.Class<SessionListResponse>("SessionListResponse")({
	type: Schema.Literal("session_list"),
	sessions: Schema.Array(Schema.Struct({id: Schema.String, clientCount: Schema.Number})),
}) {}

/** @since 0.0.2 @category models */
export class SessionCreatedResponse extends Schema.Class<SessionCreatedResponse>("SessionCreatedResponse")({
	type: Schema.Literal("session_created"),
	sessionId: Schema.String,
	channel: Schema.Number,
}) {}

/** @since 0.0.2 @category models */
export class SessionExitResponse extends Schema.Class<SessionExitResponse>("SessionExitResponse")({
	type: Schema.Literal("session_exit"),
	sessionId: Schema.String,
	channel: Schema.Number,
	exitCode: Schema.Number,
}) {}

/** @since 0.0.1 @category models */
export type ServerMessage = SessionMessage | SessionListResponse | SessionCreatedResponse | SessionExitResponse;

// Parsing

const decodeControlMessage = Schema.decodeUnknownEither(ControlMessage);

/**
 * @since 0.0.1
 * @category parsing
 */
export const parseMessage = (data: string): Option.Option<ControlMessage> => {
	if (!data.startsWith("{")) return Option.none();
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		return Option.none();
	}
	return Either.match(decodeControlMessage(parsed), {
		onLeft: () => Option.none(),
		onRight: (msg) => Option.some(msg),
	});
};
