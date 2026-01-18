import {FetchHttpClient} from "@effect/platform";
import {createYoga} from "graphql-yoga";
import {Effect, Match} from "effect";
import {Hono} from "hono";
import type {EffectContext} from "./graphql/resolver";
import {GraphQLRuntime} from "./graphql/runtime";
import {printSchemaSDL, schema} from "./graphql/schema";
import {proxyImage} from "./features/web-page-parser/proxyImage";

export {Library} from "./features/library/Library";
export {Pasaport} from "./features/pasaport/pasaport";
export {WebPageParser} from "./features/web-page-parser/WebPageParser";

const app = new Hono<{Bindings: Env}>();

// Image proxy endpoint for reader mode
app.get("/api/proxy-image", async (c) => {
	const url = c.req.query("url");
	if (!url) {
		return c.text("Missing url parameter", 400);
	}

	const program = proxyImage(decodeURIComponent(url)).pipe(
		Effect.catchAll((error) =>
			Effect.succeed(
				Match.value(error).pipe(
					Match.tag("InvalidProtocolError", () => new Response("Invalid URL protocol", {status: 400})),
					Match.tag("FetchTimeoutError", () => new Response("Request timed out", {status: 504})),
					Match.tag("FetchHttpError", (e) => new Response("Failed to fetch image", {status: e.status})),
					Match.tag("FetchNetworkError", () => new Response("Network error", {status: 502})),
					Match.exhaustive,
				),
			),
		),
		Effect.provide(FetchHttpClient.layer),
	);

	return Effect.runPromise(program);
});

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
	try {
		const pasaport = c.env.PASAPORT.getByName("kampus");
		return await pasaport.fetch(c.req.raw);
	} catch (error) {
		console.error("Error in Better Auth handler:", error);
		return c.json({error: "Authentication service error"}, 500);
	}
});

// RPC endpoint - auth + route to Library DO
app.all("/rpc/library/*", async (c) => {
	try {
		const pasaport = c.env.PASAPORT.getByName("kampus");
		const sessionData = await pasaport.validateSession(c.req.raw.headers);

		if (!sessionData?.user) {
			return c.json({error: "Unauthorized"}, 401);
		}

		// Route to user's Library DO
		const libraryId = c.env.LIBRARY.idFromName(sessionData.user.id);
		const library = c.env.LIBRARY.get(libraryId);

		return library.fetch(c.req.raw);
	} catch (error) {
		console.error("RPC error:", error);
		return c.json({error: "Internal server error"}, 500);
	}
});

// Endpoint to fetch GraphQL schema SDL
app.get("/graphql/schema", (c) => {
	return c.text(printSchemaSDL());
});

app.use("/graphql", async (c) => {
	const pasaport = c.env.PASAPORT.getByName("kampus");
	const sessionData = await pasaport.validateSession(c.req.raw.headers);

	// Create per-request runtime with Effect services
	const runtime = GraphQLRuntime.make(c.env, sessionData, c.req.raw);

	try {
		return await createYoga<EffectContext<GraphQLRuntime.Context>>({
			graphqlEndpoint: "/graphql",
			logging: true,
			graphiql: true,
			schema,
			context: () => ({runtime}),
		}).fetch(c.req.raw);
	} finally {
		await runtime.dispose();
	}
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
