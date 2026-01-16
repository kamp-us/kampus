import {FetchHttpClient} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {
	InvalidTagColorError,
	InvalidTagNameError,
	LibraryRpcs,
	type Story,
	type Tag,
	TagNameExistsError,
	type UrlMetadata,
} from "@kampus/library";
import {Effect, Exit, Layer, ManagedRuntime} from "effect";

/**
 * Creates a Library test client with a Promise-based API similar to old DO-RPC.
 *
 * @example
 * ```ts
 * const client = makeLibraryTestClient((req) => library.fetch(req));
 * const story = await client.createStory({ url: "https://example.com", title: "Test" });
 * ```
 */
export const makeLibraryTestClient = (doFetch: (request: Request) => Promise<Response>) => {
	// Inject custom fetch that routes to DO
	const customFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		return doFetch(request);
	}) as typeof fetch;

	// HttpClient layer using custom fetch - merge fetch service first
	const httpClientLayer = FetchHttpClient.layer.pipe(
		Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, customFetch)),
	);

	// Protocol layer
	const protocol = RpcClient.layerProtocolHttp({url: "http://do.test/rpc"}).pipe(
		Layer.provideMerge(RpcSerialization.layerJson),
		Layer.provideMerge(httpClientLayer),
	);

	const runtime = ManagedRuntime.make(protocol);

	const run = <A, E>(effect: Effect.Effect<A, E, RpcClient.Protocol>) => runtime.runPromise(effect);
	const runExit = <A, E>(effect: Effect.Effect<A, E, RpcClient.Protocol>) =>
		runtime.runPromiseExit(effect);

	return {
		// Story operations
		createStory: (params: {url: string; title: string; description?: string; tagIds?: string[]}) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.createStory(params);
				}).pipe(Effect.scoped),
			) as Promise<Story>,

		getStory: (id: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.getStory({id});
				}).pipe(Effect.scoped),
			) as Promise<Story | null>,

		updateStory: (
			id: string,
			params: {title?: string; description?: string | null; tagIds?: string[]},
		) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.updateStory({id, ...params});
				}).pipe(Effect.scoped),
			) as Promise<Story | null>,

		deleteStory: (id: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					const result = yield* client.deleteStory({id});
					return result.deleted;
				}).pipe(Effect.scoped),
			) as Promise<boolean>,

		listStories: (params?: {first?: number; after?: string}) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					const result = yield* client.listStories(params ?? {});
					// Map to old format
					return {
						edges: result.stories,
						hasNextPage: result.hasNextPage,
						endCursor: result.endCursor,
						totalCount: result.totalCount,
					};
				}).pipe(Effect.scoped),
			) as Promise<{
				edges: Story[];
				hasNextPage: boolean;
				endCursor: string | null;
				totalCount: number;
			}>,

		// Tag operations
		createTag: (name: string, color: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.createTag({name, color});
				}).pipe(Effect.scoped),
			) as Promise<Tag>,

		listTags: () =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.listTags();
				}).pipe(Effect.scoped),
			) as Promise<Tag[]>,

		updateTag: (id: string, params: {name?: string; color?: string}) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.updateTag({id, ...params});
				}).pipe(Effect.scoped),
			) as Promise<Tag | null>,

		deleteTag: (id: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					const result = yield* client.deleteTag({id});
					return result.deleted;
				}).pipe(Effect.scoped),
			) as Promise<boolean>,

		// Tag-Story relationships
		getTagsForStory: (storyId: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.getTagsForStory({storyId});
				}).pipe(Effect.scoped),
			) as Promise<Tag[]>,

		tagStory: (storyId: string, tagIds: string[]) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					yield* client.setStoryTags({storyId, tagIds});
				}).pipe(Effect.scoped),
			) as Promise<void>,

		getStoriesByTag: (tagId: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					const result = yield* client.listStoriesByTag({tagId});
					return result.stories;
				}).pipe(Effect.scoped),
			) as Promise<Story[]>,

		// Helper: get single tag by id (uses listTags + filter)
		getTag: async (id: string) => {
			const tags = await run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.listTags();
				}).pipe(Effect.scoped),
			);
			return (tags as Tag[]).find((t) => t.id === id) ?? null;
		},

		// Helper: remove tags from story (uses setStoryTags)
		untagStory: async (storyId: string, tagIdsToRemove: string[]) => {
			const currentTags = await run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.getTagsForStory({storyId});
				}).pipe(Effect.scoped),
			);
			const remainingTagIds = (currentTags as Tag[])
				.map((t) => t.id)
				.filter((id) => !tagIdsToRemove.includes(id));
			await run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					yield* client.setStoryTags({storyId, tagIds: remainingTagIds});
				}).pipe(Effect.scoped),
			);
		},

		// URL metadata
		fetchUrlMetadata: (url: string) =>
			run(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.fetchUrlMetadata({url});
				}).pipe(Effect.scoped),
			) as Promise<UrlMetadata>,

		// Cleanup
		dispose: () => runtime.dispose(),

		// Error-capturing variants for testing validation errors
		createTagExit: (name: string, color: string) =>
			runExit(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.createTag({name, color});
				}).pipe(Effect.scoped),
			) as Promise<
				Exit.Exit<Tag, TagNameExistsError | InvalidTagNameError | InvalidTagColorError>
			>,

		updateTagExit: (id: string, params: {name?: string; color?: string}) =>
			runExit(
				Effect.gen(function* () {
					const client = yield* RpcClient.make(LibraryRpcs);
					return yield* client.updateTag({id, ...params});
				}).pipe(Effect.scoped),
			) as Promise<
				Exit.Exit<Tag | null, TagNameExistsError | InvalidTagNameError | InvalidTagColorError>
			>,
	};
};
