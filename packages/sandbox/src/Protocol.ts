/**
 * Wormhole protocol types for tmux-like multiplexing over CF Sandbox.
 *
 * Binary frame format: [1-byte channel][payload]
 * - Channel 255 = JSON control messages
 * - Channels 0–254 = raw terminal I/O
 *
 * @since 0.1.0
 */
import * as S from "effect/Schema";

// --- Constants ---

/** @since 0.0.2 @category constants */
export const CONTROL_CHANNEL = 255;

// --- Binary framing ---

/** Encode a binary frame: `[channel (1 byte)][payload (rest)]`. @since 0.0.2 @category binary */
export const encodeBinaryFrame = (channel: number, payload: Uint8Array): Uint8Array => {
	const frame = new Uint8Array(1 + payload.byteLength);
	frame[0] = channel;
	frame.set(payload, 1);
	return frame;
};

/** Parse a binary frame back into channel number and payload. Inverse of {@link encodeBinaryFrame}. @since 0.0.2 @category binary */
export const parseBinaryFrame = (frame: Uint8Array): {channel: number; payload: Uint8Array} => ({
	channel: frame[0],
	payload: frame.subarray(1),
});

// --- Client → Server messages ---

/** Client → Server. Sent on WebSocket open to initialize the session with terminal dimensions. @since 0.1.0 @category models */
export class ConnectMessage extends S.Class<ConnectMessage>("ConnectMessage")({
	type: S.Literal("connect"),
	width: S.Number,
	height: S.Number,
}) {}

/** Client → Server. Create a new named session. @since 0.1.0 @category models */
export class SessionCreateMessage extends S.Class<SessionCreateMessage>("SessionCreateMessage")({
	type: S.Literal("session_create"),
	name: S.String,
}) {}

/** Client → Server. Destroy a session and all its tabs/panes. @since 0.1.0 @category models */
export class SessionDestroyMessage extends S.Class<SessionDestroyMessage>("SessionDestroyMessage")({
	type: S.Literal("session_destroy"),
	sessionId: S.String,
}) {}

/** Client → Server. Rename an existing session. @since 0.1.0 @category models */
export class SessionRenameMessage extends S.Class<SessionRenameMessage>("SessionRenameMessage")({
	type: S.Literal("session_rename"),
	sessionId: S.String,
	name: S.String,
}) {}

/** Client → Server. Create a new tab within a session. @since 0.1.0 @category models */
export class TabCreateMessage extends S.Class<TabCreateMessage>("TabCreateMessage")({
	type: S.Literal("tab_create"),
	sessionId: S.String,
	name: S.String,
}) {}

/** Client → Server. Close a tab and release its pane channels. @since 0.1.0 @category models */
export class TabCloseMessage extends S.Class<TabCloseMessage>("TabCloseMessage")({
	type: S.Literal("tab_close"),
	tabId: S.String,
}) {}

/** Client → Server. Rename a tab. @since 0.1.0 @category models */
export class TabRenameMessage extends S.Class<TabRenameMessage>("TabRenameMessage")({
	type: S.Literal("tab_rename"),
	tabId: S.String,
	name: S.String,
}) {}

/** Client → Server. Switch the active tab. @since 0.1.0 @category models */
export class TabSwitchMessage extends S.Class<TabSwitchMessage>("TabSwitchMessage")({
	type: S.Literal("tab_switch"),
	tabId: S.String,
}) {}

/** Client → Server. Split a pane. `orientation` uses user-facing semantics ("horizontal" = side-by-side). @since 0.1.0 @category models */
export class PaneSplitMessage extends S.Class<PaneSplitMessage>("PaneSplitMessage")({
	type: S.Literal("pane_split"),
	paneId: S.String,
	orientation: S.Union(S.Literal("horizontal"), S.Literal("vertical")),
	cols: S.Number,
	rows: S.Number,
}) {}

/** Client → Server. Close a pane and release its channel. @since 0.1.0 @category models */
export class PaneCloseMessage extends S.Class<PaneCloseMessage>("PaneCloseMessage")({
	type: S.Literal("pane_close"),
	paneId: S.String,
}) {}

/** Client → Server. Notify the server that a pane was resized. @since 0.1.0 @category models */
export class PaneResizeMessage extends S.Class<PaneResizeMessage>("PaneResizeMessage")({
	type: S.Literal("pane_resize"),
	paneId: S.String,
	cols: S.Number,
	rows: S.Number,
}) {}

/** Client → Server. Move focus to an adjacent pane in the given direction. @since 0.1.0 @category models */
export class PaneFocusMessage extends S.Class<PaneFocusMessage>("PaneFocusMessage")({
	type: S.Literal("pane_focus"),
	direction: S.Union(S.Literal("left"), S.Literal("right"), S.Literal("up"), S.Literal("down")),
}) {}

/** Union of all client → server control messages. @since 0.1.0 @category models */
export const ClientMessage = S.Union(
	ConnectMessage,
	SessionCreateMessage,
	SessionDestroyMessage,
	SessionRenameMessage,
	TabCreateMessage,
	TabCloseMessage,
	TabRenameMessage,
	TabSwitchMessage,
	PaneSplitMessage,
	PaneCloseMessage,
	PaneResizeMessage,
	PaneFocusMessage,
);

/** @since 0.1.0 @category models */
export type ClientMessage = S.Schema.Type<typeof ClientMessage>;

// --- Server → Client messages ---

/** Schema for a session as seen by the client. @since 0.1.0 @category models */
export const SessionRecord = S.Struct({
	id: S.String,
	sandboxId: S.String,
	name: S.String,
	createdAt: S.Number,
});

/** Schema for a tab as seen by the client. `layout` is the serialized `@usirin/layout-tree` tree, `focus` is a `StackPath`. @since 0.1.0 @category models */
export const TabRecord = S.Struct({
	id: S.String,
	sessionId: S.String,
	name: S.String,
	layout: S.Unknown,
	focus: S.Array(S.Number),
});

/** Server → Client. Full state snapshot sent on initial connect. @since 0.1.0 @category models */
export class StateMessage extends S.Class<StateMessage>("StateMessage")({
	type: S.Literal("state"),
	sessions: S.Array(SessionRecord),
	tabs: S.Array(TabRecord),
	activeTab: S.NullOr(S.String),
	channels: S.Record({key: S.String, value: S.Number}),
	connected: S.Record({key: S.String, value: S.Boolean}),
}) {}

/** Server → Client. Incremental update after a tab/pane mutation. @since 0.1.0 @category models */
export class LayoutUpdateMessage extends S.Class<LayoutUpdateMessage>("LayoutUpdateMessage")({
	type: S.Literal("layout_update"),
	tabs: S.Array(TabRecord),
	activeTab: S.NullOr(S.String),
	channels: S.Record({key: S.String, value: S.Number}),
	connected: S.Record({key: S.String, value: S.Boolean}),
}) {}

/** Server → Client. Signals that a session's sandbox was reset (e.g. after sleep). @since 0.1.0 @category models */
export class SessionsResetMessage extends S.Class<SessionsResetMessage>("SessionsResetMessage")({
	type: S.Literal("sessions_reset"),
	sessionId: S.String,
}) {}

/** Union of all server → client control messages. @since 0.1.0 @category models */
export const ServerMessage = S.Union(StateMessage, LayoutUpdateMessage, SessionsResetMessage);

/** @since 0.1.0 @category models */
export type ServerMessage = S.Schema.Type<typeof ServerMessage>;

// --- Helpers ---

/** JSON-encode a server message and wrap it in a control-channel binary frame. @since 0.1.0 @category helpers */
export function encodeControlMessage(msg: ServerMessage): Uint8Array {
	const json = JSON.stringify(msg);
	const payload = new TextEncoder().encode(json);
	return encodeBinaryFrame(CONTROL_CHANNEL, payload);
}

/** Decode a control-channel payload (already stripped of the channel byte) into a typed `ClientMessage`. Throws on invalid JSON or schema mismatch. @since 0.1.0 @category helpers */
export function decodeControlMessage(payload: Uint8Array): ClientMessage {
	const json = JSON.parse(new TextDecoder().decode(payload));
	return S.decodeUnknownSync(ClientMessage)(json);
}
