import {mutation, query, resolver, weave} from "@gqloom/core";
import {asyncContextProvider, useContext} from "@gqloom/core/context";
import {EffectWeaver} from "@gqloom/effect";
import {Schema} from "effect";
import {lexicographicSortSchema, printSchema} from "graphql";
import {createYoga} from "graphql-yoga";
import {Hono} from "hono";
import {getNormalizedUrl} from "./features/library/getNormalizedUrl";
import type {Session} from "./features/pasaport/auth";

export {Library} from "./features/library/Library";
export {Pasaport} from "./features/pasaport/pasaport";
export {WebPageParser} from "./features/web-page-parser/WebPageParser";

const standard = Schema.standardSchemaV1;

interface GQLContext {
	env: Env & ExecutionContext;
	pasaport: {
		user?: Session["user"];
		session?: Session["session"];
	};
	headers: Headers;
}

const app = new Hono<{Bindings: Env}>();

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
	try {
		const pasaport = c.env.PASAPORT.getByName("kampus");
		// This is the standard way to handle auth requests with Better Auth
		// The handler accepts a standard Request object
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

		// Forward request to Library DO's fetch handler
		return library.fetch(c.req.raw);
	} catch (error) {
		console.error("RPC error:", error);
		return c.json({error: "Internal server error"}, 500);
	}
});

// --- Auth Types ---

export const ApiKey = Schema.Struct({
	name: Schema.String,
	key: Schema.String,
}).annotations({
	title: "ApiKey",
});

export const User = Schema.Struct({
	id: Schema.String,
	email: Schema.String,
	name: Schema.optional(Schema.String),
}).annotations({
	title: "User",
});

export const SignInResponse = Schema.Struct({
	user: User,
	token: Schema.String,
}).annotations({
	title: "SignInResponse",
});

// --- URL Metadata Types ---

const UrlMetadata = Schema.Struct({
	title: Schema.NullOr(Schema.String),
	description: Schema.NullOr(Schema.String),
	error: Schema.NullOr(Schema.String),
}).annotations({title: "UrlMetadata"});

// --- Auth Resolvers ---

const authResolver = resolver({
	me: query(standard(User)).resolve(async () => {
		const ctx = useContext<GQLContext>();

		// Return current user if authenticated, otherwise null
		if (!ctx.pasaport.user) {
			throw new Error("Unauthorized: You must be logged in");
		}

		return {
			id: ctx.pasaport.user.id,
			email: ctx.pasaport.user.email,
			name: ctx.pasaport.user.name,
		};
	}),
	signIn: mutation(standard(SignInResponse))
		.input({
			email: standard(Schema.String),
			password: standard(Schema.String),
		})
		.resolve(async ({email, password}) => {
			const ctx = useContext<GQLContext>();

			const pasaport = ctx.env.PASAPORT.getByName("kampus");
			const {user, token} = await pasaport.loginWithEmail(email, password, ctx.headers);

			if (!user || !token) {
				throw new Error("Invalid credentials");
			}

			return {
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
				},
				token,
			};
		}),
	bootstrap: mutation(standard(User))
		.input({
			email: standard(Schema.String),
			password: standard(Schema.String),
			name: standard(Schema.String),
		})
		.resolve(async ({email, password, name}) => {
			const ctx = useContext<GQLContext>();

			// Bootstrap does not require authentication - it's for initial setup
			const pasaport = ctx.env.PASAPORT.getByName("kampus");
			const result = await pasaport.createUser(email, password, name || undefined);

			if (!result.user) {
				throw new Error("Failed to create user");
			}

			return {
				id: result.user.id,
				email: result.user.email,
				name: result.user.name,
			};
		}),
	createApiKey: mutation(standard(ApiKey))
		.input({
			name: standard(Schema.String),
		})
		.resolve(async ({name}) => {
			const ctx = useContext<GQLContext>();

			// Check if user is authenticated
			if (!ctx.pasaport.user?.id) {
				throw new Error("Unauthorized: You must be logged in to create an API key");
			}

			const pasaport = ctx.env.PASAPORT.getByName("kampus");
			const key = await pasaport.createAdminApiKey(ctx.pasaport.user.id, name);

			return {
				// biome-ignore lint/style/noNonNullAssertion: that's ok
				name: key.name!,
				key: key.key,
			};
		}),
});

// URL metadata resolver for fetching page title/description
const urlMetadataResolver = resolver({
	fetchUrlMetadata: query(standard(UrlMetadata))
		.input({
			url: standard(Schema.String),
		})
		.resolve(async ({url}) => {
			const ctx = useContext<GQLContext>();

			// Validate URL format
			let parsedUrl: URL;
			try {
				parsedUrl = new URL(url);
			} catch {
				return {title: null, description: null, error: "Invalid URL format"};
			}

			// Only allow http/https (SSRF prevention)
			if (!["http:", "https:"].includes(parsedUrl.protocol)) {
				return {title: null, description: null, error: "Only HTTP/HTTPS URLs are allowed"};
			}

			try {
				// Use normalized URL as DO key for deduplication
				const normalizedUrl = getNormalizedUrl(url);
				const parserId = ctx.env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
				const parser = ctx.env.WEB_PAGE_PARSER.get(parserId);

				await parser.init(url);
				const metadata = await parser.getMetadata();

				return {
					title: metadata.title || null,
					description: metadata.description || null,
					error: null,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to fetch metadata";
				return {title: null, description: null, error: message};
			}
		}),
});

const schema = weave(EffectWeaver, asyncContextProvider, authResolver, urlMetadataResolver);

// Endpoint to fetch GraphQL schema SDL
app.get("/graphql/schema", (c) => {
	const schemaText = printSchema(lexicographicSortSchema(schema));
	return c.text(schemaText);
});

app.use("/graphql", async (c) => {
	const forwardedHeaders = new Headers(c.req.raw.headers);
	forwardedHeaders.delete("Content-Type");

	return createYoga<GQLContext>({
		graphqlEndpoint: "/graphql",
		logging: true,
		graphiql: true,
		schema,
		context: async () => {
			const pasaport = c.env.PASAPORT.getByName("kampus");

			const sessionData = await pasaport.validateSession(forwardedHeaders);

			const context: GQLContext = {
				// @ts-expect-error
				env: {...c.env, ...c.executionCtx},
				pasaport: {user: sessionData?.user, session: sessionData?.session},
				headers: forwardedHeaders,
			};

			return context;
		},
	}).fetch(c.req.raw);
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
