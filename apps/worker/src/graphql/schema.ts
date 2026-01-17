import {WebPageParserRpcs} from "@kampus/web-page-parser";
import {Effect} from "effect";
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLInterfaceType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	GraphQLUnionType,
	lexicographicSortSchema,
	printSchema,
} from "graphql";
import {getNormalizedUrl} from "../features/library/getNormalizedUrl";
import {Auth, CloudflareEnv, RequestContext} from "../services";
import * as Spellcaster from "../shared/Spellcaster";
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

// Forward reference for UserType (will be defined below LibraryType)
let UserType: GraphQLObjectType;

const SignInResponseType = new GraphQLObjectType({
	name: "SignInResponse",
	fields: () => ({
		user: {type: new GraphQLNonNull(UserType)},
		token: {type: new GraphQLNonNull(GraphQLString)},
	}),
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
		if (obj.userId !== undefined) return "Library";
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

const LibraryType: GraphQLObjectType = new GraphQLObjectType({
	name: "Library",
	interfaces: [NodeInterface],
	fields: () => ({
		id: {
			type: new GraphQLNonNull(GraphQLID),
			resolve: (source: {userId: string}) => `library_${source.userId}`,
		},
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
			},
			resolve: resolver(function* (_source: unknown, args: {first?: number; after?: string}) {
				const client = yield* LibraryClient;
				const result = yield* client.listStories({first: args.first, after: args.after});
				return toConnection(result);
			}),
		},
		storiesByTag: {
			type: new GraphQLNonNull(StoryConnectionType),
			args: {
				tagName: {type: new GraphQLNonNull(GraphQLString)},
				first: {type: GraphQLInt},
				after: {type: GraphQLString},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {tagName: string; first?: number; after?: string},
			) {
				const client = yield* LibraryClient;
				// First get all tags to find the one with matching name
				const tags = yield* client.listTags();
				const tag = tags.find((t) => t.name === args.tagName);
				if (!tag) {
					return {edges: [], pageInfo: {hasNextPage: false, endCursor: null}, totalCount: 0};
				}
				const result = yield* client.listStoriesByTag({
					tagId: tag.id,
					first: args.first,
					after: args.after,
				});
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

					const client = yield* Spellcaster.make({rpcs: WebPageParserRpcs, stub});
					yield* client.init({url: args.url});
					const metadata = yield* client.getMetadata({});

					return {
						url: args.url,
						title: metadata.title || null,
						description: metadata.description || null,
						error: null,
					};
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to fetch metadata";
					return {url: args.url, title: null, description: null, error: message};
				}
			}),
		},
	}),
});

// Now define UserType with library field
UserType = new GraphQLObjectType({
	name: "User",
	fields: () => ({
		id: {type: new GraphQLNonNull(GraphQLString)},
		email: {type: new GraphQLNonNull(GraphQLString)},
		name: {type: GraphQLString},
		library: {
			type: new GraphQLNonNull(LibraryType),
			resolve: (source: {id: string}) => ({userId: source.id}),
		},
	}),
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

const StoryNotFoundError = new GraphQLObjectType({
	name: "StoryNotFoundError",
	fields: {
		code: {type: new GraphQLNonNull(GraphQLString)},
		message: {type: new GraphQLNonNull(GraphQLString)},
		storyId: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const UpdateStoryPayload = new GraphQLObjectType({
	name: "UpdateStoryPayload",
	fields: {
		story: {type: StoryType},
		error: {type: StoryNotFoundError},
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
		success: {type: new GraphQLNonNull(GraphQLBoolean)},
		error: {type: StoryNotFoundError},
	},
});

const CreateTagInput = new GraphQLInputObjectType({
	name: "CreateTagInput",
	fields: {
		name: {type: new GraphQLNonNull(GraphQLString)},
		color: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const InvalidTagNameError = new GraphQLObjectType({
	name: "InvalidTagNameError",
	fields: {
		code: {type: new GraphQLNonNull(GraphQLString)},
		message: {type: new GraphQLNonNull(GraphQLString)},
		tagName: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const TagNameExistsError = new GraphQLObjectType({
	name: "TagNameExistsError",
	fields: {
		code: {type: new GraphQLNonNull(GraphQLString)},
		message: {type: new GraphQLNonNull(GraphQLString)},
		tagName: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const TagNotFoundError = new GraphQLObjectType({
	name: "TagNotFoundError",
	fields: {
		code: {type: new GraphQLNonNull(GraphQLString)},
		message: {type: new GraphQLNonNull(GraphQLString)},
		tagId: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const TagError = new GraphQLUnionType({
	name: "TagError",
	types: [InvalidTagNameError, TagNameExistsError],
	resolveType: (obj) => {
		if (obj.code === "INVALID_TAG_NAME") return "InvalidTagNameError";
		if (obj.code === "TAG_NAME_EXISTS") return "TagNameExistsError";
		return undefined;
	},
});

const CreateTagPayload = new GraphQLObjectType({
	name: "CreateTagPayload",
	fields: {
		tag: {type: TagType},
		error: {type: TagError},
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

					const client = yield* Spellcaster.make({rpcs: WebPageParserRpcs, stub});
					yield* client.init({url: args.url});
					const metadata = yield* client.getMetadata({});

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
		},
		node: {
			type: NodeInterface,
			args: {
				// Use GraphQLString instead of GraphQLID to match Relay's generated pagination queries
				id: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				// Determine type by ID prefix
				if (args.id.startsWith("library_")) {
					const {user} = yield* Auth.required;
					const userId = args.id.replace("library_", "");
					// Only allow access to own library
					if (userId !== user.id) return null;
					return {userId};
				}
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
				url: {type: new GraphQLNonNull(GraphQLString)},
				title: {type: new GraphQLNonNull(GraphQLString)},
				description: {type: GraphQLString},
				tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLString))},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {url: string; title: string; description?: string | null; tagIds?: string[] | null},
			) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const story = yield* client.createStory({
					url: args.url,
					title: args.title,
					description: args.description ?? undefined,
					tagIds: args.tagIds ?? undefined,
				});
				return {story};
			}),
		},
		updateStory: {
			type: new GraphQLNonNull(UpdateStoryPayload),
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
				title: {type: GraphQLString},
				description: {type: GraphQLString},
				tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLString))},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {id: string; title?: string | null; description?: string | null; tagIds?: string[] | null},
			) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const story = yield* client.updateStory({
					id: args.id,
					title: args.title ?? undefined,
					description: args.description ?? undefined,
					tagIds: args.tagIds ?? undefined,
				});
				if (!story) {
					return {
						story: null,
						error: {
							code: "STORY_NOT_FOUND",
							message: `Story with id "${args.id}" was not found`,
							storyId: args.id,
						},
					};
				}
				return {story, error: null};
			}),
		},
		deleteStory: {
			type: new GraphQLNonNull(DeleteStoryPayload),
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const result = yield* client.deleteStory({id: args.id});
				if (result.deleted) {
					return {
						deletedStoryId: args.id,
						success: true,
						error: null,
					};
				}
				return {
					deletedStoryId: null,
					success: false,
					error: {
						code: "STORY_NOT_FOUND",
						message: `Story with id "${args.id}" was not found`,
						storyId: args.id,
					},
				};
			}),
		},
		createTag: {
			type: new GraphQLNonNull(CreateTagPayload),
			args: {
				name: {type: new GraphQLNonNull(GraphQLString)},
				color: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {name: string; color: string}) {
				yield* Auth.required;
				const client = yield* LibraryClient;
				const tag = yield* client.createTag({
					name: args.name,
					color: args.color,
				});
				return {tag, error: null};
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
	types: [StoryType, TagType, LibraryType],
});

export function printSchemaSDL(): string {
	return printSchema(lexicographicSortSchema(schema));
}
