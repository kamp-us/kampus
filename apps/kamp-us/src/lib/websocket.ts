import {getStoredToken} from "../auth/AuthContext";

/**
 * Constructs the WebSocket URL for GraphQL subscriptions.
 *
 * In development, connects directly to the backend worker on port 8787.
 * In production, uses the same host (proxied through kamp-us worker).
 *
 * SECURITY NOTE: Token is passed via query parameter because cookies aren't
 * sent cross-origin for WebSocket connections. This has tradeoffs:
 * - URL may be logged by proxies, CDNs, or browser history
 * - Mitigations: tokens have short expiry (configured in Better Auth),
 *   connections use WSS in production, and tokens are single-purpose
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
