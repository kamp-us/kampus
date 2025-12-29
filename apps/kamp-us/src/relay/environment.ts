import {
  Environment,
  Network,
  RecordSource,
  Store,
  type FetchFunction,
  type GraphQLResponse,
} from "relay-runtime";
import {getStoredToken} from "../auth/AuthContext";

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

export function createRelayEnvironment() {
  return new Environment({
    network: Network.create(fetchQuery),
    store: new Store(new RecordSource()),
  });
}

export const environment = createRelayEnvironment();
