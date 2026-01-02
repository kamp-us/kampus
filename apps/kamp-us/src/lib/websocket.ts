import {getStoredUserId} from "../auth/AuthContext";

/**
 * Constructs the WebSocket URL for GraphQL subscriptions.
 *
 * In development, connects directly to the backend worker on port 8787.
 * In production, uses the same host (proxied through kamp-us worker).
 *
 * SECURITY: Token is passed via connectionParams (in connection_init message),
 * NOT in the URL. The user ID in the URL is used for routing only (not secret).
 * The backend validates the token from connectionParams matches the routed user.
 */
export function getWebSocketUrl(): string {
	const userId = getStoredUserId();
	// User ID is used for routing only - token is validated in connectionParams
	const userParam = userId ? `?userId=${encodeURIComponent(userId)}` : "";

	if (import.meta.env.DEV) {
		return `ws://localhost:8787/graphql${userParam}`;
	}

	// Always use WSS in production for security
	return `wss://${window.location.host}/graphql${userParam}`;
}
