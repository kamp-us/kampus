import {mutation, query, resolver, weave} from "@gqloom/core";
import {asyncContextProvider, useContext} from "@gqloom/core/context";
import {EffectWeaver} from "@gqloom/effect";
import {Schema} from "effect";
import {createYoga} from "graphql-yoga";
import {Hono} from "hono";

export {Pasaport} from "./features/pasaport/pasaport";

const standard = Schema.standardSchemaV1;

interface GQLContext {
	env: Env & ExecutionContext;
	pasaport: {
		header?: string | null;
		user?: {
			id: string;
			email?: string | null;
			name?: string | null;
			role?: string;
		} | null;
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

app.post("/api/cli/login", async (c) => {
	try {
		const {email, password} = await c.req.json();
		const pasaport = c.env.PASAPORT.getByName("kampus");

		const headers = new Headers(c.req.raw.headers);
		const {user, token} = await pasaport.loginWithEmail(email, password, headers);

		if (!user || !token) {
			return c.json({error: "Invalid credentials"}, 401);
		}

		return c.json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
			token,
		});
	} catch (error) {
		console.error("Error in CLI login:", error);
		return c.json({error: "Login failed"}, 500);
	}
});

export const ApiKey = Schema.Struct({
	name: Schema.String,
	key: Schema.String,
}).annotations({
	title: "ApiKey",
});

const helloResolver = resolver({
	hello: query(standard(Schema.String), () => {
		const ctx = useContext<GQLContext>();

		return "Hello, World! " + ctx.pasaport.header;
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
			console.log("sessionData", sessionData);

			const context: GQLContext = {
				// @ts-expect-error
				env: {...c.env, ...c.executionCtx},
				pasaport: {user: sessionData?.user},
				headers: forwardedHeaders,
			};

			return context;
		},
	}).fetch(c.req.raw);
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
