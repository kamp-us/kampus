import {Effect} from "effect";
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLInterfaceType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	lexicographicSortSchema,
	printSchema,
} from "graphql";
import {getNormalizedUrl} from "../features/library/getNormalizedUrl";
import {makeWebPageParserClient} from "../features/web-page-parser/client";
import {Auth, CloudflareEnv, RequestContext} from "../services";
import {createConnectionTypes, toConnection} from "./connections";
import {resolver} from "./resolver";
import {LibraryClient} from "./resolvers/LibraryClient";
import {loadStory} from "./resolvers/StoryResolver";
import {loadTag} from "./resolvers/TagResolver";

// =============================================================================
// GraphQL Types
// =============================================================================

const ApiKeyType = new GraphQLObjectType({
	name: "ApiKey",
	fields: {
		name: {type: new GraphQLNonNull(GraphQLString)},
		key: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const UserType = new GraphQLObjectType({
	name: "User",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLString)},
		email: {type: new GraphQLNonNull(GraphQLString)},
		name: {type: GraphQLString},
	},
});

const SignInResponseType = new GraphQLObjectType({
	name: "SignInResponse",
	fields: {
		user: {type: new GraphQLNonNull(UserType)},
		token: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const UrlMetadataType = new GraphQLObjectType({
	name: "UrlMetadata",
	fields: {
		title: {type: GraphQLString},
		description: {type: GraphQLString},
		error: {type: GraphQLString},
	},
});

// =============================================================================
// Node Interface (Relay)
// =============================================================================

const NodeInterface = new GraphQLInterfaceType({
	name: "Node",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLID)},
	},
	resolveType: (obj) => {
		if (obj.url !== undefined) return "Story";
		if (obj.color !== undefined) return "Tag";
		return undefined;
	},
});

// =============================================================================
// Library Types
// =============================================================================

const TagType = new GraphQLObjectType({
	name: "Tag",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLID)},
		name: {type: new GraphQLNonNull(GraphQLString)},
		color: {type: new GraphQLNonNull(GraphQLString)},
	},
});

// Lazy fields function for Story to handle circular reference with tags
const StoryType: GraphQLObjectType = new GraphQLObjectType({
	name: "Story",
	interfaces: [NodeInterface],
	fields: () => ({
		id: {type: new GraphQLNonNull(GraphQLID)},
		url: {type: new GraphQLNonNull(GraphQLString)},
		title: {type: new GraphQLNonNull(GraphQLString)},
		description: {type: GraphQLString},
		createdAt: {type: new GraphQLNonNull(GraphQLString)},
		tags: {
			type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagType))),
			// Tags are already embedded in Story response from RPC, no resolver needed
		},
	}),
});

const {EdgeType: StoryEdgeType, ConnectionType: StoryConnectionType} = createConnectionTypes(
	"Story",
	StoryType,
);

const WebPageType = new GraphQLObjectType({
	name: "WebPage",
	fields: {
		url: {type: new GraphQLNonNull(GraphQLString)},
		title: {type: GraphQLString},
		description: {type: GraphQLString},
		error: {type: GraphQLString},
	},
});

// =============================================================================
// Library Namespace Type
// =============================================================================

const LibraryType = new GraphQLObjectType({
	name: "Library",
	fields: {
		story: {
			type: StoryType,
			args: {
				id: {type: new GraphQLNonNull(GraphQLID)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				return yield* loadStory(args.id);
			}),
		},
		stories: {
			type: new GraphQLNonNull(StoryConnectionType),
			args: {
				first: {type: GraphQLInt},
				after: {type: GraphQLString},
				tagId: {type: GraphQLID},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {first?: number; after?: string; tagId?: string},
			) {
				const client = yield* LibraryClient;
				const result = args.tagId
					? yield* client.listStoriesByTag({
							tagId: args.tagId,
							first: args.first,
							after: args.after,
						})
					: yield* client.listStories({first: args.first, after: args.after});
				return toConnection(result);
			}),
		},
		tags: {
			type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagType))),
			resolve: resolver(function* () {
				const client = yield* LibraryClient;
				return yield* client.listTags();
			}),
		},
		webPage: {
			type: WebPageType,
			args: {
				url: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {url: string}) {
				const env = yield* CloudflareEnv;

				let parsedUrl: URL;
				try {
					parsedUrl = new URL(args.url);
				} catch {
					return {url: args.url, title: null, description: null, error: "Invalid URL format"};
				}

				if (!["http:", "https:"].includes(parsedUrl.protocol)) {
					return {
						url: args.url,
						title: null,
						description: null,
						error: "Only HTTP/HTTPS URLs are allowed",
					};
				}

				try {
					const normalizedUrl = getNormalizedUrl(args.url);
					const parserId = env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
					const stub = env.WEB_PAGE_PARSER.get(parserId);

					const client = makeWebPageParserClient((req) => stub.fetch(req));
					try {
						yield* Effect.promise(() => client.init(args.url));
						const metadata = yield* Effect.promise(() => client.getMetadata());

						return {
							url: args.url,
							title: metadata.title || null,
							description: metadata.description || null,
							error: null,
						};
					} finally {
						yield* Effect.promise(() => client.dispose());
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to fetch metadata";
					return {url: args.url, title: null, description: null, error: message};
				}
			}),
		},
	},
});

// =============================================================================
// Mutation Input/Payload Types
// =============================================================================

const CreateStoryInput = new GraphQLInputObjectType({
	name: "CreateStoryInput",
	fields: {
		url: {type: new GraphQLNonNull(GraphQLString)},
		title: {type: new GraphQLNonNull(GraphQLString)},
		description: {type: GraphQLString},
		tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLID))},
	},
});

const CreateStoryPayload = new GraphQLObjectType({
	name: "CreateStoryPayload",
	fields: {
		story: {type: StoryType},
		storyEdge: {type: StoryEdgeType},
	},
});

const UpdateStoryInput = new GraphQLInputObjectType({
	name: "UpdateStoryInput",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLID)},
		title: {type: GraphQLString},
		description: {type: GraphQLString},
		tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLID))},
	},
});

const UpdateStoryPayload = new GraphQLObjectType({
	name: "UpdateStoryPayload",
	fields: {
		story: {type: StoryType},
	},
});

const DeleteStoryInput = new GraphQLInputObjectType({
	name: "DeleteStoryInput",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLID)},
	},
});

const DeleteStoryPayload = new GraphQLObjectType({
	name: "DeleteStoryPayload",
	fields: {
		deletedStoryId: {type: GraphQLID},
	},
});

const CreateTagInput = new GraphQLInputObjectType({
	name: "CreateTagInput",
	fields: {
		name: {type: new GraphQLNonNull(GraphQLString)},
		color: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const CreateTagPayload = new GraphQLObjectType({
	name: "CreateTagPayload",
	fields: {
		tag: {type: TagType},
	},
});

// =============================================================================
// Query Type
// =============================================================================

const QueryType = new GraphQLObjectType({
	name: "Query",
	fields: {
		me: {
			type: UserType,
			resolve: resolver(function* () {
				const {user} = yield* Auth.required;
				return {
					id: user.id,
					email: user.email,
					name: user.name,
				};
			}),
		},
		fetchUrlMetadata: {
			type: UrlMetadataType,
			args: {
				url: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {url: string}) {
				const env = yield* CloudflareEnv;

				// Validate URL format
				let parsedUrl: URL;
				try {
					parsedUrl = new URL(args.url);
				} catch {
					return {title: null, description: null, error: "Invalid URL format"};
				}

				// Only allow http/https (SSRF prevention)
				if (!["http:", "https:"].includes(parsedUrl.protocol)) {
					return {title: null, description: null, error: "Only HTTP/HTTPS URLs are allowed"};
				}

				try {
					// Use normalized URL as DO key for deduplication
					const normalizedUrl = getNormalizedUrl(args.url);
					const parserId = env.WEB_PAGE_PARSER.idFromName(normalizedUrl);
					const stub = env.WEB_PAGE_PARSER.get(parserId);

					// Use Effect RPC client to call WebPageParser
					const client = makeWebPageParserClient((req) => stub.fetch(req));
					try {
						yield* Effect.promise(() => client.init(args.url));
						const metadata = yield* Effect.promise(() => client.getMetadata());

						return {
							title: metadata.title || null,
							description: metadata.description || null,
							error: null,
						};
					} finally {
						yield* Effect.promise(() => client.dispose());
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to fetch metadata";
					return {title: null, description: null, error: message};
				}
			}),
		},
		library: {
			type: new GraphQLNonNull(LibraryType),
			resolve: resolver(function* () {
				yield* Auth.required;
				return {};
			}),
		},
		node: {
			type: NodeInterface,
			args: {
				id: {type: new GraphQLNonNull(GraphQLID)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				// Determine type by ID prefix
				if (args.id.startsWith("story_")) {
					return yield* loadStory(args.id);
				}
				if (args.id.startsWith("tag_")) {
					return yield* loadTag(args.id);
				}
				return null;
			}),
		},
	},
});

// =============================================================================
// Mutation Type
// =============================================================================

const MutationType = new GraphQLObjectType({
	name: "Mutation",
	fields: {
		signIn: {
			type: SignInResponseType,
			args: {
				email: {type: new GraphQLNonNull(GraphQLString)},
				password: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {email: string; password: string}) {
				const env = yield* CloudflareEnv;
				const ctx = yield* RequestContext;

				const pasaport = env.PASAPORT.getByName("kampus");
				const result = yield* Effect.promise(() =>
					pasaport.loginWithEmail(args.email, args.password, ctx.headers),
				);

				if (!result.user || !result.token) {
					throw new Error("Invalid credentials");
				}

				return {
					user: {
						id: result.user.id,
						email: result.user.email,
						name: result.user.name,
					},
					token: result.token,
				};
			}),
		},
		bootstrap: {
			type: UserType,
			args: {
				email: {type: new GraphQLNonNull(GraphQLString)},
				password: {type: new GraphQLNonNull(GraphQLString)},
				name: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {email: string; password: string; name: string},
			) {
				const env = yield* CloudflareEnv;

				const pasaport = env.PASAPORT.getByName("kampus");
				const result = yield* Effect.promise(async () =>
					pasaport.createUser(args.email, args.password, args.name || undefined),
				);

				if (!result.user) {
					throw new Error("Failed to create user");
				}

				return {
					id: result.user.id,
					email: result.user.email,
					name: result.user.name,
				};
			}),
		},
		createApiKey: {
			type: ApiKeyType,
			args: {
				name: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {name: string}) {
				const env = yield* CloudflareEnv;
				const {user} = yield* Auth.required;

				const pasaport = env.PASAPORT.getByName("kampus");
				const key = yield* Effect.promise(
					async (): Promise<{key: string; name: string | null}> =>
						pasaport.createAdminApiKey(user.id, args.name),
				);

				if (!key.name) {
					throw new Error("Failed to create API key");
				}

				return {
					name: key.name,
					key: key.key,
				};
			}),
		},
		createStory: {
			type: new GraphQLNonNull(CreateStoryPayload),
			args: {
				input: {type: new GraphQLNonNull(CreateStoryInput)},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {
					input: {
						url: string;
						title: string;
						description?: string;
						tagIds?: string[];
					};
				},
			) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const story = yield* client.createStory({
					url: args.input.url,
					title: args.input.title,
					description: args.input.description,
					tagIds: args.input.tagIds,
				});
				return {
					story,
					storyEdge: {node: story, cursor: story.id},
				};
			}),
		},
		updateStory: {
			type: new GraphQLNonNull(UpdateStoryPayload),
			args: {
				input: {type: new GraphQLNonNull(UpdateStoryInput)},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {
					input: {
						id: string;
						title?: string;
						description?: string;
						tagIds?: string[];
					};
				},
			) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const story = yield* client.updateStory({
					id: args.input.id,
					title: args.input.title,
					description: args.input.description,
					tagIds: args.input.tagIds,
				});
				return {story};
			}),
		},
		deleteStory: {
			type: new GraphQLNonNull(DeleteStoryPayload),
			args: {
				input: {type: new GraphQLNonNull(DeleteStoryInput)},
			},
			resolve: resolver(function* (_source: unknown, args: {input: {id: string}}) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const result = yield* client.deleteStory({id: args.input.id});
				return {
					deletedStoryId: result.deleted ? args.input.id : null,
				};
			}),
		},
		createTag: {
			type: new GraphQLNonNull(CreateTagPayload),
			args: {
				input: {type: new GraphQLNonNull(CreateTagInput)},
			},
			resolve: resolver(function* (_source: unknown, args: {input: {name: string; color: string}}) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const tag = yield* client.createTag({
					name: args.input.name,
					color: args.input.color,
				});
				return {tag};
			}),
		},
	},
});

// =============================================================================
// Schema
// =============================================================================

export const schema = new GraphQLSchema({
	query: QueryType,
	mutation: MutationType,
	types: [StoryType, TagType],
});

export function printSchemaSDL(): string {
	return printSchema(lexicographicSortSchema(schema));
}
