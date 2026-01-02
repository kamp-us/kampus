import {type Client, createClient} from "graphql-ws";
import {
	Environment,
	type FetchFunction,
	type GraphQLResponse,
	Network,
	Observable,
	RecordSource,
	Store,
	type SubscribeFunction,
} from "relay-runtime";
import {getStoredToken} from "../auth/AuthContext";
import {getWebSocketUrl} from "../lib/websocket";

const fetchQuery: FetchFunction = async (operation, variables) => {
	const token = getStoredToken();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const response = await fetch("/graphql", {
		method: "POST",
		headers,
		body: JSON.stringify({
			query: operation.text,
			variables,
		}),
	});

	return (await response.json()) as GraphQLResponse;
};

function createSubscriptionClient(): Client {
	return createClient({
		url: getWebSocketUrl(),
		retryAttempts: Infinity,
		shouldRetry: () => true,
		retryWait: (retryCount) => {
			// Exponential backoff: 1s, 2s, 4s, 8s, max 30s
			const delay = Math.min(1000 * 2 ** retryCount, 30000);
			return new Promise((resolve) => setTimeout(resolve, delay));
		},
		on: {
			connected: () => console.log("[Subscription] Connected"),
			closed: () => console.log("[Subscription] Closed"),
			error: (error) => console.error("[Subscription] Error:", error),
		},
	});
}

let subscriptionClient: Client | null = null;

function getSubscriptionClient(): Client {
	if (!subscriptionClient) {
		subscriptionClient = createSubscriptionClient();
	}
	return subscriptionClient;
}

/**
 * Reset the subscription client (call on logout)
 */
export function resetSubscriptionClient(): void {
	if (subscriptionClient) {
		subscriptionClient.dispose();
		subscriptionClient = null;
	}
}

const subscribe: SubscribeFunction = (operation, variables) => {
	return Observable.create((sink) => {
		const client = getSubscriptionClient();

		const dispose = client.subscribe(
			{
				operationName: operation.name,
				query: operation.text!,
				variables,
			},
			{
				next: (value) => sink.next(value as GraphQLResponse),
				error: sink.error,
				complete: sink.complete,
			},
		);

		return dispose;
	});
};

export function createRelayEnvironment() {
	return new Environment({
		network: Network.create(fetchQuery, subscribe),
		store: new Store(new RecordSource()),
	});
}

export const environment = createRelayEnvironment();
