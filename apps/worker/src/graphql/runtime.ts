import {Layer, ManagedRuntime} from "effect";
import type {Session} from "../features/pasaport/auth";
import {Auth, CloudflareEnv, RequestContext} from "../services";

/**
 * The requirements for a GraphQL request runtime.
 */
export type GraphQLContext = CloudflareEnv | Auth | RequestContext;

/**
 * GraphQL runtime factory following Effect-idiomatic patterns.
 */
export namespace GraphQLRuntime {
	/**
	 * The service requirements for GraphQL resolvers.
	 */
	export type Context = GraphQLContext;
	/**
	 * Create a Layer for a GraphQL request with all services provided.
	 */
	export const layer = (
		env: Env,
		sessionData: {user?: Session["user"]; session?: Session["session"]} | null,
		request: Request,
	): Layer.Layer<GraphQLContext> =>
		Layer.mergeAll(
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

	/**
	 * Create a ManagedRuntime for a GraphQL request.
	 */
	export const make = (
		env: Env,
		sessionData: {user?: Session["user"]; session?: Session["session"]} | null,
		request: Request,
	): ManagedRuntime.ManagedRuntime<GraphQLContext, never> =>
		ManagedRuntime.make(layer(env, sessionData, request));
}
