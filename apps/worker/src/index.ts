import {field, mutation, query, resolver, silk, weave} from "@gqloom/core";
import {asyncContextProvider, useContext} from "@gqloom/core/context";
import {asObjectType, EffectWeaver} from "@gqloom/effect";
import {Schema} from "effect";
import {
	GraphQLID,
	GraphQLInterfaceType,
	GraphQLNonNull,
	GraphQLString,
	lexicographicSortSchema,
	printSchema,
} from "graphql";
import {createYoga} from "graphql-yoga";
import {Hono} from "hono";
import type {Session} from "./features/pasaport/auth";
import {decodeGlobalId, encodeGlobalId, NodeType} from "./graphql/relay";

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

// --- Library GraphQL Types ---

// Node interface - using native GraphQL to avoid duplicate type errors
// GQLoom creates duplicates when Effect Schema is used for both interface
// declaration (in interfaces: []) and return type (Schema.NullOr(Node))
const NodeInterface = new GraphQLInterfaceType({
	name: "Node",
	description: "An object with a globally unique ID",
	fields: () => ({
		id: {type: new GraphQLNonNull(GraphQLID)},
	}),
});

const Story = Schema.Struct({
	__typename: Schema.optional(Schema.Literal("Story")),
	id: Schema.String.annotations({identifier: "ulid"}),
	url: Schema.String,
	title: Schema.String,
	createdAt: Schema.String,
}).annotations({
	title: "Story",
	[asObjectType]: {interfaces: [NodeInterface]},
});

// Helper to transform story with global ID
function toStoryNode(story: {id: string; url: string; title: string; createdAt: string}) {
	return {
		__typename: "Story" as const,
		id: encodeGlobalId(NodeType.Story, story.id),
		url: story.url,
		title: story.title,
		createdAt: story.createdAt,
	};
}

const StoryEdge = Schema.Struct({
	node: Story,
	cursor: Schema.String,
}).annotations({title: "StoryEdge"});

const PageInfo = Schema.Struct({
	hasNextPage: Schema.Boolean,
	hasPreviousPage: Schema.Boolean,
	startCursor: Schema.NullOr(Schema.String),
	endCursor: Schema.NullOr(Schema.String),
}).annotations({title: "PageInfo"});

const StoryConnection = Schema.Struct({
	edges: Schema.Array(StoryEdge),
	pageInfo: PageInfo,
}).annotations({title: "StoryConnection"});

const Library = Schema.Struct({}).annotations({title: "Library"});

// Mutation payloads
const StoryNotFoundError = Schema.Struct({
	code: Schema.Literal("STORY_NOT_FOUND"),
	message: Schema.String,
	storyId: Schema.String,
}).annotations({title: "StoryNotFoundError"});

const CreateStoryPayload = Schema.Struct({
	story: Story,
}).annotations({title: "CreateStoryPayload"});

const UpdateStoryPayload = Schema.Struct({
	story: Schema.NullOr(Story),
	error: Schema.NullOr(StoryNotFoundError),
}).annotations({title: "UpdateStoryPayload"});

const DeleteStoryPayload = Schema.Struct({
	success: Schema.Boolean,
	deletedStoryId: Schema.NullOr(Schema.String),
	error: Schema.NullOr(StoryNotFoundError),
}).annotations({title: "DeleteStoryPayload"});

// --- Library Resolvers ---

const libraryResolver = resolver.of(standard(Library), {
	stories: field(standard(StoryConnection))
		.input({
			first: standard(Schema.NullOr(Schema.Number)),
			after: standard(Schema.NullOr(Schema.String)),
		})
		.resolve(async (_parent, input) => {
			const ctx = useContext<GQLContext>();
			if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

			// Decode cursor if provided (it's a global ID)
			let afterLocalId: string | undefined;
			if (input.after) {
				const decoded = decodeGlobalId(input.after);
				afterLocalId = decoded?.id;
			}

			const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
			const lib = ctx.env.LIBRARY.get(libraryId);
			const result = await lib.listStories({
				first: input.first ?? 20,
				after: afterLocalId,
			});

			return {
				edges: result.edges.map((story) => ({
					node: toStoryNode(story),
					cursor: encodeGlobalId(NodeType.Story, story.id),
				})),
				pageInfo: {
					hasNextPage: result.hasNextPage,
					hasPreviousPage: false,
					startCursor: result.edges[0] ? encodeGlobalId(NodeType.Story, result.edges[0].id) : null,
					endCursor: result.endCursor ? encodeGlobalId(NodeType.Story, result.endCursor) : null,
				},
			};
		}),
});

const userResolver = resolver.of(standard(User), {
	library: field(standard(Library)).resolve(() => ({})),
});

const storyResolver = resolver.of(standard(Story), {
	createStory: mutation(standard(CreateStoryPayload))
		.input({
			url: standard(Schema.String),
			title: standard(Schema.String),
		})
		.resolve(async ({url, title}) => {
			const ctx = useContext<GQLContext>();
			if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

			const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
			const lib = ctx.env.LIBRARY.get(libraryId);
			const story = await lib.createStory({url, title});

			return {
				story: toStoryNode(story),
			};
		}),

	updateStory: mutation(standard(UpdateStoryPayload))
		.input({
			id: standard(Schema.String),
			title: standard(Schema.NullOr(Schema.String)),
		})
		.resolve(async ({id: globalId, title}) => {
			const ctx = useContext<GQLContext>();
			if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

			// Decode global ID
			const decoded = decodeGlobalId(globalId);
			if (!decoded || decoded.type !== NodeType.Story) {
				return {
					story: null,
					error: {
						code: "STORY_NOT_FOUND" as const,
						message: `Invalid story ID: "${globalId}"`,
						storyId: globalId,
					},
				};
			}

			const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
			const lib = ctx.env.LIBRARY.get(libraryId);
			const story = await lib.updateStory(decoded.id, {title: title ?? undefined});

			if (!story) {
				return {
					story: null,
					error: {
						code: "STORY_NOT_FOUND" as const,
						message: `Story with id "${globalId}" not found`,
						storyId: globalId,
					},
				};
			}

			return {
				story: toStoryNode(story),
				error: null,
			};
		}),

	deleteStory: mutation(standard(DeleteStoryPayload))
		.input({
			id: standard(Schema.String),
		})
		.resolve(async ({id: globalId}) => {
			const ctx = useContext<GQLContext>();
			if (!ctx.pasaport.user?.id) throw new Error("Unauthorized");

			// Decode global ID
			const decoded = decodeGlobalId(globalId);
			if (!decoded || decoded.type !== NodeType.Story) {
				return {
					success: false,
					deletedStoryId: null,
					error: {
						code: "STORY_NOT_FOUND" as const,
						message: `Invalid story ID: "${globalId}"`,
						storyId: globalId,
					},
				};
			}

			const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
			const lib = ctx.env.LIBRARY.get(libraryId);

			const deleted = await lib.deleteStory(decoded.id);
			if (!deleted) {
				return {
					success: false,
					deletedStoryId: null,
					error: {
						code: "STORY_NOT_FOUND" as const,
						message: `Story with id "${globalId}" not found`,
						storyId: globalId,
					},
				};
			}

			return {
				success: true,
				deletedStoryId: globalId,
				error: null,
			};
		}),
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

// Node query resolver for Relay refetching
const nodeResolver = resolver({
	node: query(silk.nullable(silk<{__typename: string; id: string}>(NodeInterface)))
		.input({
			id: standard(Schema.String),
		})
		.resolve(async ({id: globalId}) => {
			const ctx = useContext<GQLContext>();

			// Require authentication
			if (!ctx.pasaport.user?.id) {
				return null;
			}

			// Decode global ID
			const decoded = decodeGlobalId(globalId);
			if (!decoded) {
				return null;
			}

			// Get user's library
			const libraryId = ctx.env.LIBRARY.idFromName(ctx.pasaport.user.id);
			const lib = ctx.env.LIBRARY.get(libraryId);

			// Route to appropriate fetcher based on type
			switch (decoded.type) {
				case NodeType.Story: {
					const story = await lib.getStory(decoded.id);
					if (!story) return null;

					return {
						__typename: "Story" as const,
						id: globalId,
						url: story.url,
						title: story.title,
						createdAt: story.createdAt,
					};
				}
				default:
					return null;
			}
		}),
});

const schema = weave(
	EffectWeaver,
	asyncContextProvider,
	helloResolver,
	userResolver,
	libraryResolver,
	storyResolver,
	nodeResolver,
);

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
