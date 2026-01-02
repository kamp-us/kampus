import {DurableObject} from "cloudflare:workers";
import type {
	ChannelEvent,
	ClientMessage,
	CompleteMessage,
	ConnectionState,
	ReadyState,
	SubscribeMessage,
} from "./types";

/**
 * UserChannel is a per-user Durable Object that manages WebSocket connections
 * and channel subscriptions. It implements the graphql-ws protocol and provides
 * a publish(channel, event) RPC method for other DOs to broadcast events.
 *
 * Key features:
 * - Hibernatable WebSockets for cost efficiency
 * - Channel-based pub/sub (e.g., "library", "notifications")
 * - graphql-ws protocol support
 */
export class UserChannel extends DurableObject<Env> {
	private ownerId: string | undefined = undefined;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			this.ownerId = await this.ctx.storage.get<string>("owner");
		});
	}

	/**
	 * Set the owner of this channel (called once when user is created).
	 */
	async setOwner(userId: string): Promise<void> {
		this.ownerId = userId;
		await this.ctx.storage.put("owner", userId);
	}

	/**
	 * Handle WebSocket upgrade requests.
	 */
	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");

		if (upgradeHeader?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket", {status: 426});
		}

		const protocol = request.headers.get("Sec-WebSocket-Protocol");
		if (protocol !== "graphql-transport-ws") {
			return new Response("Unsupported WebSocket Protocol", {status: 400});
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);

		server.serializeAttachment({
			state: "awaiting_init",
			connectedAt: Date.now(),
		} satisfies ConnectionState);

		return new Response(null, {
			status: 101,
			headers: {
				"Sec-WebSocket-Protocol": "graphql-transport-ws",
			},
			webSocket: client,
		});
	}

	/**
	 * Handle incoming WebSocket messages (graphql-ws protocol).
	 */
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") {
			this.closeWithError(ws, 4400, "Binary messages not supported");
			return;
		}

		let parsed: ClientMessage;
		try {
			parsed = JSON.parse(message);
		} catch {
			this.closeWithError(ws, 4400, "Invalid JSON");
			return;
		}

		const state = ws.deserializeAttachment() as ConnectionState;

		switch (parsed.type) {
			case "connection_init":
				await this.handleConnectionInit(ws, state);
				break;

			case "subscribe":
				await this.handleSubscribe(ws, parsed, state);
				break;

			case "complete":
				await this.handleComplete(ws, parsed, state);
				break;

			case "ping":
				ws.send(JSON.stringify({type: "pong"}));
				break;

			default:
				this.closeWithError(ws, 4400, "Unknown message type");
		}
	}

	/**
	 * Handle WebSocket close.
	 */
	async webSocketClose(
		_ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	): Promise<void> {
		console.log(`WebSocket closed: code=${code}, reason=${reason}, clean=${wasClean}`);
	}

	/**
	 * Publish event to all subscribers of a channel.
	 * Called by other DOs (Library, Notifications, etc.)
	 */
	async publish(channel: string, event: ChannelEvent): Promise<void> {
		const webSockets = this.ctx.getWebSockets();
		console.log(`[UserChannel] publish(${channel}): ${webSockets.length} WebSockets connected`);

		for (const ws of webSockets) {
			try {
				const state = ws.deserializeAttachment() as ConnectionState;
				console.log(`[UserChannel] WebSocket state:`, state.state, state.state === "ready" ? (state as ReadyState).subscriptions : "");

				if (state.state === "ready") {
					const subscriptionId = state.subscriptions[channel];
					if (subscriptionId) {
						console.log(`[UserChannel] Sending event to subscription ${subscriptionId}`);
						ws.send(
							JSON.stringify({
								id: subscriptionId,
								type: "next",
								payload: {
									data: {
										channel: event,
									},
								},
							}),
						);
					} else {
						console.log(`[UserChannel] No subscription for channel ${channel}`);
					}
				}
			} catch (error) {
				console.error("Failed to send to WebSocket:", error);
			}
		}
	}

	/**
	 * Get count of active WebSocket connections.
	 */
	async getConnectionCount(): Promise<number> {
		return this.ctx.getWebSockets().length;
	}

	/**
	 * Get count of subscribers for a specific channel.
	 */
	async getSubscriberCount(channel: string): Promise<number> {
		const webSockets = this.ctx.getWebSockets();
		let count = 0;

		for (const ws of webSockets) {
			const state = ws.deserializeAttachment() as ConnectionState;
			if (state.state === "ready" && state.subscriptions[channel]) {
				count++;
			}
		}

		return count;
	}

	// --- Private methods ---

	private async handleConnectionInit(ws: WebSocket, state: ConnectionState): Promise<void> {
		if (state.state !== "awaiting_init") {
			this.closeWithError(ws, 4429, "Too many initialisation requests");
			return;
		}

		// Check connection init timeout (10 seconds)
		if (Date.now() - state.connectedAt > 10_000) {
			this.closeWithError(ws, 4408, "Connection initialisation timeout");
			return;
		}

		if (!this.ownerId) {
			this.closeWithError(ws, 4403, "Forbidden");
			return;
		}

		ws.serializeAttachment({
			state: "ready",
			userId: this.ownerId,
			subscriptions: {},
		} satisfies ReadyState);

		ws.send(JSON.stringify({type: "connection_ack"}));
	}

	private async handleSubscribe(
		ws: WebSocket,
		message: SubscribeMessage,
		state: ConnectionState,
	): Promise<void> {
		console.log(`[UserChannel] handleSubscribe: id=${message.id}, state=${state.state}`);

		if (state.state !== "ready") {
			this.closeWithError(ws, 4401, "Unauthorized");
			return;
		}

		// Extract channel name from subscription query
		// Expected format: subscription { channel(name: "library") { ... } }
		const channelMatch = message.payload.query.match(/channel\s*\(\s*name\s*:\s*"([^"]+)"\s*\)/);
		if (!channelMatch) {
			console.log(`[UserChannel] handleSubscribe: failed to parse channel from query:`, message.payload.query);
			ws.send(
				JSON.stringify({
					id: message.id,
					type: "error",
					payload: [{message: 'Invalid subscription: must specify channel(name: "...")'}],
				}),
			);
			return;
		}

		const channelName = channelMatch[1];
		console.log(`[UserChannel] handleSubscribe: registering channel=${channelName}, subId=${message.id}`);

		// Register subscription
		const newSubscriptions = {...state.subscriptions, [channelName]: message.id};
		ws.serializeAttachment({
			...state,
			subscriptions: newSubscriptions,
		} satisfies ReadyState);
	}

	private async handleComplete(
		ws: WebSocket,
		message: CompleteMessage,
		state: ConnectionState,
	): Promise<void> {
		if (state.state !== "ready") return;

		// Find and remove the subscription by ID
		const newSubscriptions = {...state.subscriptions};
		for (const [channel, subId] of Object.entries(newSubscriptions)) {
			if (subId === message.id) {
				delete newSubscriptions[channel];
				break;
			}
		}

		ws.serializeAttachment({
			...state,
			subscriptions: newSubscriptions,
		} satisfies ReadyState);

		ws.send(JSON.stringify({id: message.id, type: "complete"}));
	}

	private closeWithError(ws: WebSocket, code: number, reason: string): void {
		ws.close(code, reason);
	}
}
