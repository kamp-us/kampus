/**
 * Connection state for WebSocket attachments.
 * Stored via serializeAttachment() and survives DO hibernation.
 */

/**
 * Rate limiting state for a connection.
 * Uses a sliding window approach with message count.
 */
export interface RateLimitState {
	/** Timestamp of the start of the current window */
	windowStart: number;
	/** Number of messages in the current window */
	messageCount: number;
}

export interface AwaitingInitState {
	state: "awaiting_init";
	connectedAt: number;
	rateLimit: RateLimitState;
}

export interface ReadyState {
	state: "ready";
	userId: string;
	/** Map of channel name -> subscription ID (from graphql-ws Subscribe message) */
	subscriptions: Record<string, string>;
	rateLimit: RateLimitState;
}

export type ConnectionState = AwaitingInitState | ReadyState;

/**
 * Generic event that can be published to any channel.
 * Channel-specific event types (e.g., LibraryEvent) extend this.
 */
export interface ChannelEvent {
	type: string;
	[key: string]: unknown;
}

/**
 * graphql-ws protocol message types (client to server)
 */
export interface ConnectionInitMessage {
	type: "connection_init";
	payload?: Record<string, unknown>;
}

export interface SubscribeMessage {
	type: "subscribe";
	id: string;
	payload: {
		query: string;
		operationName?: string;
		variables?: Record<string, unknown>;
	};
}

export interface CompleteMessage {
	type: "complete";
	id: string;
}

export interface PingMessage {
	type: "ping";
}

export type ClientMessage =
	| ConnectionInitMessage
	| SubscribeMessage
	| CompleteMessage
	| PingMessage;
