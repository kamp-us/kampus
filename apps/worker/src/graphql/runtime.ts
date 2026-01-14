import {Layer, ManagedRuntime} from "effect";
import type {Session} from "../features/pasaport/auth";
import {Auth, CloudflareEnv, RequestContext} from "../services";

/**
 * Create a ManagedRuntime for a GraphQL request with all services provided.
 */
export function createGraphQLRuntime(
	env: Env,
	sessionData: {user?: Session["user"]; session?: Session["session"]} | null,
	request: Request,
): ManagedRuntime.ManagedRuntime<CloudflareEnv | Auth | RequestContext, never> {
	const layer = Layer.mergeAll(
		Layer.succeed(CloudflareEnv, env),
		Layer.succeed(Auth, {
			user: sessionData?.user,
			session: sessionData?.session,
		}),
		Layer.succeed(RequestContext, {
			headers: request.headers,
			url: request.url,
			method: request.method,
		}),
	);
	return ManagedRuntime.make(layer);
}
