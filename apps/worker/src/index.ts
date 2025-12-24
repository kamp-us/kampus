import {mutation, query, resolver, weave} from "@gqloom/core";
import {asyncContextProvider, useContext} from "@gqloom/core/context";
import {EffectWeaver} from "@gqloom/effect";
import {Schema} from "effect";
import {createYoga} from "graphql-yoga";
import {Hono} from "hono";
import type {Session} from "./features/pasaport/auth";

export {Pasaport} from "./features/pasaport/pasaport";

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

const helloResolver = resolver({
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

const schema = weave(EffectWeaver, asyncContextProvider, helloResolver);

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
