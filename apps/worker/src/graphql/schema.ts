import {Effect} from "effect";
import {
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	lexicographicSortSchema,
	printSchema,
} from "graphql";
import {getNormalizedUrl} from "../features/library/getNormalizedUrl";
import {Auth, CloudflareEnv, RequestContext} from "../services";
import {resolver} from "./resolver";

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
					const parser = env.WEB_PAGE_PARSER.get(parserId);

					yield* Effect.promise(() => parser.init(args.url));
					const metadata = yield* Effect.promise(() => parser.getMetadata());

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
