import {Effect} from "effect";
import {
	GraphQLBoolean,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	lexicographicSortSchema,
	printSchema,
} from "graphql";
import {Auth, CloudflareEnv, makeLibraryRpc, makePasaportRpc, RequestContext} from "../services";
import {resolver} from "./resolver";

// =============================================================================
// GraphQL Types - Auth
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
		image: {type: GraphQLString},
	},
});

const SignInResponseType = new GraphQLObjectType({
	name: "SignInResponse",
	fields: {
		user: {type: new GraphQLNonNull(UserType)},
		token: {type: new GraphQLNonNull(GraphQLString)},
	},
});

// =============================================================================
// GraphQL Types - Library
// =============================================================================

const TagRefType = new GraphQLObjectType({
	name: "TagRef",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLString)},
		name: {type: new GraphQLNonNull(GraphQLString)},
		color: {type: new GraphQLNonNull(GraphQLString)},
	},
});

const StoryType: GraphQLObjectType = new GraphQLObjectType({
	name: "Story",
	fields: () => ({
		id: {type: new GraphQLNonNull(GraphQLString)},
		url: {type: new GraphQLNonNull(GraphQLString)},
		title: {type: new GraphQLNonNull(GraphQLString)},
		description: {type: GraphQLString},
		createdAt: {type: new GraphQLNonNull(GraphQLString)},
		tags: {type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagRefType)))},
	}),
});

const TagType = new GraphQLObjectType({
	name: "Tag",
	fields: {
		id: {type: new GraphQLNonNull(GraphQLString)},
		name: {type: new GraphQLNonNull(GraphQLString)},
		color: {type: new GraphQLNonNull(GraphQLString)},
		createdAt: {type: new GraphQLNonNull(GraphQLString)},
		storyCount: {type: new GraphQLNonNull(GraphQLInt)},
	},
});

const StoriesPageType = new GraphQLObjectType({
	name: "StoriesPage",
	fields: {
		stories: {type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(StoryType)))},
		hasNextPage: {type: new GraphQLNonNull(GraphQLBoolean)},
		endCursor: {type: GraphQLString},
		totalCount: {type: new GraphQLNonNull(GraphQLInt)},
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
// Helper: Get Library RPC for authenticated user
// =============================================================================

const getLibraryRpc = Effect.gen(function* () {
	const env = yield* CloudflareEnv;
	const ctx = yield* RequestContext;
	const {user} = yield* Auth.required;

	const libraryId = env.LIBRARY.idFromName(user.id);
	const library = env.LIBRARY.get(libraryId);

	return yield* makeLibraryRpc(library, ctx.headers);
});

// =============================================================================
// Query Type
// =============================================================================

const QueryType = new GraphQLObjectType({
	name: "Query",
	fields: {
		// Auth queries
		me: {
			type: UserType,
			resolve: resolver(function* () {
				const env = yield* CloudflareEnv;
				const ctx = yield* RequestContext;

				const pasaport = env.PASAPORT.getByName("kampus");
				const rpc = yield* makePasaportRpc(pasaport, ctx.headers);
				return yield* rpc.me();
			}),
		},

		// Library queries
		story: {
			type: StoryType,
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.getStory({id: args.id});
			}),
		},

		stories: {
			type: new GraphQLNonNull(StoriesPageType),
			args: {
				first: {type: GraphQLInt},
				after: {type: GraphQLString},
			},
			resolve: resolver(function* (_source: unknown, args: {first?: number; after?: string}) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.listStories({first: args.first, after: args.after});
			}),
		},

		storiesByTag: {
			type: new GraphQLNonNull(StoriesPageType),
			args: {
				tagId: {type: new GraphQLNonNull(GraphQLString)},
				first: {type: GraphQLInt},
				after: {type: GraphQLString},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {tagId: string; first?: number; after?: string},
			) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.listStoriesByTag({
					tagId: args.tagId,
					first: args.first,
					after: args.after,
				});
			}),
		},

		tags: {
			type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagType))),
			resolve: resolver(function* () {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.listTags();
			}),
		},

		tagsForStory: {
			type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagType))),
			args: {
				storyId: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {storyId: string}) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.getTagsForStory({storyId: args.storyId});
			}),
		},

		fetchUrlMetadata: {
			type: UrlMetadataType,
			args: {
				url: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {url: string}) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.fetchUrlMetadata({url: args.url});
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
		// Auth mutations
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
				const rpc = yield* makePasaportRpc(pasaport, ctx.headers);

				const result = yield* rpc.signIn({email: args.email, password: args.password});

				return {
					user: {
						id: result.user.id,
						email: result.user.email,
						name: result.user.name,
						image: result.user.image,
					},
					token: result.token,
				};
			}),
		},

		signUp: {
			type: UserType,
			args: {
				email: {type: new GraphQLNonNull(GraphQLString)},
				password: {type: new GraphQLNonNull(GraphQLString)},
				name: {type: GraphQLString},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {email: string; password: string; name?: string},
			) {
				const env = yield* CloudflareEnv;
				const ctx = yield* RequestContext;

				const pasaport = env.PASAPORT.getByName("kampus");
				const rpc = yield* makePasaportRpc(pasaport, ctx.headers);

				const result = yield* rpc.signUp({
					email: args.email,
					password: args.password,
					name: args.name,
				});

				return {
					id: result.id,
					email: result.email,
					name: result.name,
					image: result.image,
				};
			}),
		},

		createApiKey: {
			type: ApiKeyType,
			args: {
				name: {type: new GraphQLNonNull(GraphQLString)},
				expiresInDays: {type: GraphQLInt},
			},
			resolve: resolver(function* (_source: unknown, args: {name: string; expiresInDays?: number}) {
				const env = yield* CloudflareEnv;
				const ctx = yield* RequestContext;

				// Require authentication
				yield* Auth.required;

				const pasaport = env.PASAPORT.getByName("kampus");
				const rpc = yield* makePasaportRpc(pasaport, ctx.headers);

				const result = yield* rpc.createApiKey({
					name: args.name,
					expiresInDays: args.expiresInDays,
				});

				return {
					name: result.name,
					key: result.key,
				};
			}),
		},

		// Library mutations
		createStory: {
			type: new GraphQLNonNull(StoryType),
			args: {
				url: {type: new GraphQLNonNull(GraphQLString)},
				title: {type: new GraphQLNonNull(GraphQLString)},
				description: {type: GraphQLString},
				tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLString))},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {url: string; title: string; description?: string; tagIds?: string[]},
			) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.createStory({
					url: args.url,
					title: args.title,
					description: args.description,
					tagIds: args.tagIds,
				});
			}),
		},

		updateStory: {
			type: StoryType,
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
				title: {type: GraphQLString},
				description: {type: GraphQLString},
				tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLString))},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {id: string; title?: string; description?: string; tagIds?: string[]},
			) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.updateStory({
					id: args.id,
					title: args.title,
					description: args.description,
					tagIds: args.tagIds,
				});
			}),
		},

		deleteStory: {
			type: new GraphQLNonNull(GraphQLBoolean),
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				const rpc = yield* getLibraryRpc;
				const result = yield* rpc.deleteStory({id: args.id});
				return result.deleted;
			}),
		},

		createTag: {
			type: new GraphQLNonNull(TagType),
			args: {
				name: {type: new GraphQLNonNull(GraphQLString)},
				color: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {name: string; color: string}) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.createTag({name: args.name, color: args.color});
			}),
		},

		updateTag: {
			type: TagType,
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
				name: {type: GraphQLString},
				color: {type: GraphQLString},
			},
			resolve: resolver(function* (
				_source: unknown,
				args: {id: string; name?: string; color?: string},
			) {
				const rpc = yield* getLibraryRpc;
				return yield* rpc.updateTag({id: args.id, name: args.name, color: args.color});
			}),
		},

		deleteTag: {
			type: new GraphQLNonNull(GraphQLBoolean),
			args: {
				id: {type: new GraphQLNonNull(GraphQLString)},
			},
			resolve: resolver(function* (_source: unknown, args: {id: string}) {
				const rpc = yield* getLibraryRpc;
				const result = yield* rpc.deleteTag({id: args.id});
				return result.deleted;
			}),
		},

		setStoryTags: {
			type: new GraphQLNonNull(GraphQLBoolean),
			args: {
				storyId: {type: new GraphQLNonNull(GraphQLString)},
				tagIds: {type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString)))},
			},
			resolve: resolver(function* (_source: unknown, args: {storyId: string; tagIds: string[]}) {
				const rpc = yield* getLibraryRpc;
				const result = yield* rpc.setStoryTags({storyId: args.storyId, tagIds: args.tagIds});
				return result.success;
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
});

export function printSchemaSDL(): string {
	return printSchema(lexicographicSortSchema(schema));
}
