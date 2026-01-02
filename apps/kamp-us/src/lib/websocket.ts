import {getStoredToken} from "../auth/AuthContext";

/**
 * Constructs the WebSocket URL for GraphQL subscriptions.
 *
 * In development, connects directly to the backend worker on port 8787.
 * In production, uses the same host (proxied through kamp-us worker).
 *
 * Authentication is passed via query parameter since cookies aren't
 * sent cross-origin for WebSocket connections.
 */
export function getWebSocketUrl(): string {
	const token = getStoredToken();
	const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";

	if (import.meta.env.DEV) {
		return `ws://localhost:8787/graphql${tokenParam}`;
	}

	const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${wsProtocol}//${window.location.host}/graphql${tokenParam}`;
}
