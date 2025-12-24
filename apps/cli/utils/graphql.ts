import {getSessionToken, getWorkerUrl} from "./config";

export interface GraphQLResponse<T = unknown> {
	data?: T;
	errors?: Array<{
		message: string;
		extensions?: Record<string, unknown>;
	}>;
}

export async function graphqlRequest<T = unknown>(
	query: string,
	variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
	const workerUrl = getWorkerUrl();
	const sessionToken = getSessionToken();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (sessionToken) {
		headers.Authorization = `Bearer ${sessionToken}`;
	}

	const response = await fetch(`${workerUrl}/graphql`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			query,
			variables,
		}),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return (await response.json()) as GraphQLResponse<T>;
}

