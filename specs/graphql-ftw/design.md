# Design: GraphQL + Relay Data Layer

Derived from [requirements.md](./requirements.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (kamp-us)                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ LibraryPage │  │  StoryRow   │  │  TagChip    │              │
│  │  (Query)    │  │ (Fragment)  │  │ (Fragment)  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┴────────────────┘                      │
│                          │                                       │
│              ┌───────────▼───────────┐                           │
│              │   RelayEnvironment    │                           │
│              │   (normalized cache)  │                           │
│              └───────────┬───────────┘                           │
└──────────────────────────┼──────────────────────────────────────┘
                           │ POST /graphql
┌──────────────────────────┼──────────────────────────────────────┐
│ Worker                   ▼                                       │
│              ┌───────────────────────┐                           │
│              │    graphql-yoga       │                           │
│              │    (schema, auth)     │                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
│              ┌───────────▼───────────┐                           │
│              │   GraphQL Resolvers   │                           │
│              │   resolver() helper   │                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
│         ┌────────────────┼────────────────┐                      │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Direct RPC  │  │ RequestRes. │  │ RequestRes. │              │
│  │ (list ops)  │  │ (GetStory)  │  │ (GetTag)    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┴────────────────┘                      │
│                          │                                       │
│              ┌───────────▼───────────┐                           │
│              │     Spellcaster       │                           │
│              │   (RPC client factory)│                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
│              ┌───────────▼───────────┐                           │
│              │    Spellbook DO       │                           │
│              │   (Library, Pasaport) │                           │
│              └───────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/worker/src/
├── shared/
│   ├── Spellbook.ts          # existing, add wrapHandlers
│   └── Spellcaster.ts        # NEW: RPC client factory
├── graphql/
│   ├── schema.ts             # extend with Library types
│   ├── resolver.ts           # existing resolver() helper
│   ├── runtime.ts            # existing GraphQLRuntime
│   ├── connections.ts        # NEW: Relay connection types + toConnection
│   ├── requests.ts           # NEW: Effect Request types
│   └── resolvers/
│       ├── index.ts          # NEW: barrel export
│       ├── StoryResolver.ts  # NEW: batched story lookups
│       ├── TagResolver.ts    # NEW: batched tag lookups
│       ├── LibraryClient.ts  # NEW: Spellcaster service (Context.Tag)
│       └── WebPageParserClient.ts # NEW: make(env, url) factory
├── features/library/
│   ├── Library.ts            # existing DO
│   └── handlers.ts           # flatten exports, add batch

packages/library/src/
└── rpc.ts                    # add getBatchStory, getBatchTag

apps/kamp-us/src/
├── relay/
│   ├── environment.ts        # NEW: RelayEnvironment
│   └── index.ts              # NEW: barrel export
├── pages/
│   ├── Library.tsx           # NEW: Relay version
│   └── LibraryRpc.tsx        # deprecated, then remove
└── rpc/
    └── atoms.ts              # remove library atoms
```

## Backend Design

### Spellcaster (RPC Client Factory)

```typescript
// apps/worker/src/shared/Spellcaster.ts
import {RpcClient, RpcSerialization} from "@effect/rpc"
import type {Rpc, RpcGroup} from "@effect/rpc"
import {Effect, Layer} from "effect"

// Fetchable interface - compatible with DO stubs
interface Fetchable {
  fetch(request: Request): Promise<Response> | Response
}

export interface MakeConfig<R extends Rpc.Any> {
  readonly rpcs: RpcGroup.RpcGroup<R>
  readonly stub: Fetchable
}

export const make = <R extends Rpc.Any>(
  config: MakeConfig<R>
): Effect.Effect<RpcClient.RpcClient<R>> => {
  // Custom HttpClient that routes to DO stub
  // IMPORTANT: Does NOT use @effect/platform FetchHttpClient
  // which doesn't work in Cloudflare Workers runtime
  const HttpClientLive = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.makeDefault((request) =>
      Effect.gen(function* () {
        const body = yield* request.text
        const req = new Request("http://do.internal/rpc", {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body,
        })
        const response = yield* Effect.promise(() =>
          Promise.resolve(config.stub.fetch(req))
        )
        return HttpClientResponse.fromWeb(request, response)
      })
    )
  )

  const protocol = RpcClient.layerProtocolHttp({url: "http://do.internal/rpc"}).pipe(
    Layer.provideMerge(RpcSerialization.layerJson),
    Layer.provideMerge(HttpClientLive)
  )

  return RpcClient.make(config.rpcs).pipe(Effect.provide(protocol), Effect.scoped)
}
```

**Key design decision:** Spellcaster bypasses `@effect/platform`'s `FetchHttpClient.layer` because it doesn't work in Cloudflare Workers runtime. Instead, it creates a custom `HttpClient` that routes directly to the DO stub's fetch method.

### LibraryClient Service

```typescript
// apps/worker/src/graphql/resolvers/LibraryClient.ts
import {Effect, Context} from "effect"
import {LibraryRpcs} from "@kampus/library"
import * as Spellcaster from "../../shared/Spellcaster"

// Service that provides a Library RPC client for current user
export class LibraryClient extends Context.Tag("LibraryClient")<
  LibraryClient,
  RpcClient.RpcClient<typeof LibraryRpcs.rpcs>
>() {}

// Layer created per-request with user's DO stub
export const makeLibraryClientLayer = (env: Env, userId: string) =>
  Layer.effect(
    LibraryClient,
    Spellcaster.make({
      rpcs: LibraryRpcs,
      stub: env.LIBRARY.get(env.LIBRARY.idFromName(userId))
    })
  )
```

### WebPageParserClient (make pattern)

Unlike LibraryClient, WebPageParserClient uses a simple `make()` factory instead of Context.Tag + Layer.

**Why different patterns:**
- LibraryClient is keyed by userId (known at request start, same for entire request)
- WebPageParserClient is keyed by URL (different per-call, resolved dynamically)

```typescript
// apps/worker/src/graphql/resolvers/WebPageParserClient.ts
import {WebPageParserRpcs} from "@kampus/web-page-parser"
import {Effect} from "effect"
import {getNormalizedUrl} from "../../features/library/getNormalizedUrl"
import * as Spellcaster from "../../shared/Spellcaster"

export interface WebPageMetadata {
  title: string | null
  description: string | null
}

// Simple make() factory - returns Effect with initialized client
export const make = (env: Env, url: string) =>
  Effect.gen(function* () {
    const normalizedUrl = getNormalizedUrl(url)
    const client = yield* Spellcaster.make({
      rpcs: WebPageParserRpcs,
      stub: env.WEB_PAGE_PARSER.get(env.WEB_PAGE_PARSER.idFromName(normalizedUrl)),
    })
    yield* client.init({url})  // init encapsulated here

    return {
      getMetadata: (): Effect.Effect<WebPageMetadata> =>
        Effect.gen(function* () {
          const metadata = yield* client.getMetadata({})
          return {
            title: metadata.title || null,
            description: metadata.description || null,
          }
        }),
    }
  })

export const WebPageParserClient = {make}
```

**Key design decisions:**
- Encapsulates `init()` call - callers just get metadata
- Handles URL normalization internally
- Returns Effect (not Layer) - created on-demand per URL
- Stateless from caller's perspective (DO caches internally)

### Effect Request Types

```typescript
// apps/worker/src/graphql/requests.ts
import {Request} from "effect"
import type {Story, Tag} from "@kampus/library"

// Request for single story lookup
export interface GetStory extends Request.Request<Story | null, never> {
  readonly _tag: "GetStory"
  readonly id: string
}
export const GetStory = Request.tagged<GetStory>("GetStory")

// Request for single tag lookup
export interface GetTag extends Request.Request<Tag | null, never> {
  readonly _tag: "GetTag"
  readonly id: string
}
export const GetTag = Request.tagged<GetTag>("GetTag")
```

### RequestResolvers

**IMPORTANT: Batching requires explicit opt-in.** Effect does NOT batch by default.
Use `batching: true` in Effect.all/forEach options, or wrap with `Effect.withRequestBatching(true)`.

```typescript
// apps/worker/src/graphql/resolvers/StoryResolver.ts
import {RequestResolver, Effect, Request} from "effect"
import {GetStory} from "../requests"
import {LibraryClient} from "./LibraryClient"

export const StoryResolver = RequestResolver.makeBatched(
  (requests: ReadonlyArray<GetStory>) =>
    Effect.gen(function* () {
      const client = yield* LibraryClient
      const ids = requests.map((r) => r.id)
      const results = yield* client.getBatchStory({ids})

      yield* Effect.forEach(requests, (req, i) =>
        Request.completeEffect(req, Effect.succeed(results[i] ?? null))
      )
    })
).pipe(RequestResolver.contextFromServices(LibraryClient))

// Helper for use in resolvers
export const loadStory = (id: string) =>
  Effect.request(GetStory({id}), StoryResolver)

// Usage - batching must be enabled!
Effect.all([loadStory("1"), loadStory("2"), loadStory("3")], {
  concurrency: "unbounded",
  batching: true,  // <-- required for batching to occur
})
```

### Relay Connection Types

```typescript
// apps/worker/src/graphql/connections.ts
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLID,
} from "graphql"

// Reusable PageInfo (Relay spec)
export const PageInfoType = new GraphQLObjectType({
  name: "PageInfo",
  fields: {
    hasNextPage: {type: new GraphQLNonNull(GraphQLBoolean)},
    hasPreviousPage: {type: new GraphQLNonNull(GraphQLBoolean)},
    startCursor: {type: GraphQLString},
    endCursor: {type: GraphQLString},
  },
})

// Factory for creating connection types
export const createConnectionTypes = <TNode extends GraphQLObjectType>(
  nodeName: string,
  nodeType: TNode
) => {
  const EdgeType = new GraphQLObjectType({
    name: `${nodeName}Edge`,
    fields: {
      node: {type: new GraphQLNonNull(nodeType)},
      cursor: {type: new GraphQLNonNull(GraphQLString)},
    },
  })

  const ConnectionType = new GraphQLObjectType({
    name: `${nodeName}Connection`,
    fields: {
      edges: {type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EdgeType)))},
      pageInfo: {type: new GraphQLNonNull(PageInfoType)},
      totalCount: {type: new GraphQLNonNull(GraphQLInt)},  // extension
    },
  })

  return {EdgeType, ConnectionType}
}

// Transform RPC response to Relay connection
export const toConnection = <T extends {id: string}>(
  data: {
    stories: T[]
    hasNextPage: boolean
    endCursor: string | null
    totalCount: number
  }
) => ({
  edges: data.stories.map((node) => ({
    node,
    cursor: node.id,  // cursor = id for this implementation
  })),
  pageInfo: {
    hasNextPage: data.hasNextPage,
    hasPreviousPage: false,  // not implemented in backend
    startCursor: data.stories[0]?.id ?? null,
    endCursor: data.endCursor,
  },
  totalCount: data.totalCount,
})
```

### GraphQL Schema Extensions

```typescript
// apps/worker/src/graphql/schema.ts (additions)
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInt,
  GraphQLInputObjectType,
  GraphQLID
} from "graphql"
import {createConnectionTypes, toConnection} from "./connections"

const TagType = new GraphQLObjectType({
  name: "Tag",
  fields: {
    id: {type: new GraphQLNonNull(GraphQLID)},
    name: {type: new GraphQLNonNull(GraphQLString)},
    color: {type: new GraphQLNonNull(GraphQLString)},
  },
})

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
      // Tags are embedded in Story RPC response - no resolver needed
      // This is more efficient than batched tag resolution (0 extra RPC calls)
    },
  }),
})

// Create Relay connection types for Story
const {EdgeType: StoryEdgeType, ConnectionType: StoryConnectionType} =
  createConnectionTypes("Story", StoryType)

const WebPageType = new GraphQLObjectType({
  name: "WebPage",
  fields: {
    url: {type: new GraphQLNonNull(GraphQLString)},
    title: {type: GraphQLString},
    description: {type: GraphQLString},
    error: {type: GraphQLString},
  },
})

const LibraryType = new GraphQLObjectType({
  name: "Library",
  fields: {
    story: {
      type: StoryType,
      args: {id: {type: new GraphQLNonNull(GraphQLID)}},
      resolve: resolver(function* (_, {id}: {id: string}) {
        return yield* loadStory(id)
      }),
    },
    stories: {
      type: new GraphQLNonNull(StoryConnectionType),
      args: {
        first: {type: GraphQLInt},
        after: {type: GraphQLString},
        tagId: {type: GraphQLID},
      },
      resolve: resolver(function* (_, args: {first?: number; after?: string; tagId?: string}) {
        const client = yield* LibraryClient
        // Call appropriate RPC based on filter
        const result = args.tagId
          ? yield* client.listStoriesByTag({tagId: args.tagId, first: args.first, after: args.after})
          : yield* client.listStories({first: args.first, after: args.after})
        // Transform to Relay connection format
        return toConnection(result)
      }),
    },
    tags: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TagType))),
      resolve: resolver(function* () {
        const client = yield* LibraryClient
        return yield* client.listTags({})
      }),
    },
    webPage: {
      type: WebPageType,
      args: {url: {type: new GraphQLNonNull(GraphQLString)}},
      resolve: resolver(function* (_, {url}: {url: string}) {
        const env = yield* CloudflareEnv
        const client = yield* WebPageParserClient.make(env, url)
        const metadata = yield* client.getMetadata()
        return {url, title: metadata.title, description: metadata.description, error: null}
      }),
    },
  },
})

// Add to QueryType
const QueryType = new GraphQLObjectType({
  name: "Query",
  fields: {
    // ... existing fields ...
    library: {
      type: new GraphQLNonNull(LibraryType),
      resolve: resolver(function* () {
        // Namespace resolver, just returns empty object
        // Auth check happens here
        yield* Auth.required
        return {}
      }),
    },
  },
})
```

### Mutation Design

```typescript
// Mutation input/payload pattern for Relay
const CreateStoryInput = new GraphQLInputObjectType({
  name: "CreateStoryInput",
  fields: {
    url: {type: new GraphQLNonNull(GraphQLString)},
    title: {type: new GraphQLNonNull(GraphQLString)},
    description: {type: GraphQLString},
    tagIds: {type: new GraphQLList(new GraphQLNonNull(GraphQLID))},
  },
})

const CreateStoryPayload = new GraphQLObjectType({
  name: "CreateStoryPayload",
  fields: {
    story: {type: StoryType},  // Relay uses this to update store
    storyEdge: {type: StoryEdgeType},  // For connection updates
  },
})

// In MutationType
createStory: {
  type: new GraphQLNonNull(CreateStoryPayload),
  args: {input: {type: new GraphQLNonNull(CreateStoryInput)}},
  resolve: resolver(function* (_, {input}) {
    yield* Auth.required
    const client = yield* LibraryClient
    const story = yield* client.createStory(input)
    return {
      story,
      storyEdge: {node: story, cursor: story.id},
    }
  }),
}
```

### Handler Flattening

```typescript
// apps/worker/src/features/library/handlers.ts
// BEFORE (object literal with inline implementation)
export const handlers = {
  getStory: ({id}: {id: string}) =>
    Effect.gen(function* () { ... }).pipe(Effect.orDie),
  // ...
}

// AFTER (named exports)
export const getStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const db = yield* SqliteDrizzle
    const [story] = yield* db.select().from(schema.story).where(eq(schema.story.id, id))
    return story ?? null
  })

export const getBatchStory = ({ids}: {ids: readonly string[]}) =>
  Effect.gen(function* () {
    if (ids.length === 0) return []
    const db = yield* SqliteDrizzle
    const stories = yield* db.select().from(schema.story).where(inArray(schema.story.id, [...ids]))
    const storyMap = new Map(stories.map(s => [s.id, s]))
    return ids.map(id => storyMap.get(id) ?? null)
  })

// ... other handlers as named exports

// Library.ts
import * as handlers from "./handlers"
export const Library = Spellbook.make({
  rpcs: LibraryRpcs,
  handlers,
  migrations,
})
```

### Spellbook wrapHandlers

```typescript
// apps/worker/src/shared/Spellbook.ts (addition)
const wrapHandlers = <H extends Record<string, (...args: any[]) => Effect.Effect<any, any, any>>>(
  handlers: H
): H =>
  Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      (...args: Parameters<typeof handler>) =>
        handler(...args).pipe(Effect.catchTag("SqlError", Effect.die)),
    ])
  ) as H

// In Spellbook.make()
export const make = <...>(config: Config) => {
  const wrappedHandlers = wrapHandlers(config.handlers)
  // ... use wrappedHandlers
}
```

## Frontend Design

### Relay Environment

```typescript
// apps/kamp-us/src/relay/environment.ts
import {Environment, Network, RecordSource, Store} from "relay-runtime"

const fetchQuery = async (operation: any, variables: any) => {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    credentials: "include",  // send cookies for auth
    body: JSON.stringify({
      query: operation.text,
      variables,
    }),
  })
  return response.json()
}

export const environment = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
})
```

### URL State with effect-atom

```typescript
// apps/kamp-us/src/pages/Library.tsx
import {Atom} from "effect-atom"

// Sync tag filter with URL search params
const tagFilterAtom = Atom.searchParam("tag")

// Usage in component
function Library() {
  const tagId = useAtomValue(tagFilterAtom)
  const setTagId = useSetAtom(tagFilterAtom)

  // Pass to Relay query
  const data = useLazyLoadQuery(LibraryQuery, {
    first: 10,
    tagId,  // null if no filter
  })

  // Update filter (automatically syncs to ?tag=xxx)
  const handleTagClick = (id: string) => setTagId(id)
  const handleClearFilter = () => setTagId(null)
}
```

**Why effect-atom for URL state:**
- `Atom.searchParam` handles URL sync automatically
- Reactive updates when URL changes (back/forward nav)
- Clean separation: effect-atom owns client state, Relay owns server data

### Library Page with Relay

```typescript
// apps/kamp-us/src/pages/Library.tsx
import {graphql, useLazyLoadQuery, useMutation, useFragment} from "react-relay"
import {Atom} from "effect-atom"

const tagFilterAtom = Atom.searchParam("tag")

const LibraryQuery = graphql`
  query LibraryQuery($first: Int!, $after: String, $tagId: ID) {
    library {
      stories(first: $first, after: $after, tagId: $tagId) @connection(key: "Library_stories") {
        edges {
          node {
            id
            ...StoryRow_story
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      tags {
        id
        name
        color
      }
    }
  }
`

function StoryRow(props: {story: StoryRow_story$key}) {
  const story = useFragment(
    graphql`
      fragment StoryRow_story on Story {
        id
        url
        title
        description
        createdAt
        tags {
          id
          name
          color
        }
      }
    `,
    props.story
  )
  // ... render using story
}

const CreateStoryMutation = graphql`
  mutation LibraryCreateStoryMutation($input: CreateStoryInput!) {
    createStory(input: $input) {
      storyEdge {
        node {
          id
          ...StoryRow_story
        }
      }
    }
  }
`

function CreateStoryForm() {
  const [commit, isInFlight] = useMutation(CreateStoryMutation)

  const handleSubmit = (data: CreateStoryInput) => {
    commit({
      variables: {input: data},
      updater: (store) => {
        // Relay handles connection updates via @appendEdge or manual
      },
      optimisticResponse: {
        createStory: {
          storyEdge: {
            node: {id: "temp-id", ...data, tags: [], createdAt: new Date().toISOString()},
          },
        },
      },
    })
  }
}

// Main Library component - integrates effect-atom URL state with Relay
function Library() {
  const tagId = useAtomValue(tagFilterAtom)  // reads from ?tag=xxx
  const setTagId = useSetAtom(tagFilterAtom)

  const data = useLazyLoadQuery(LibraryQuery, {
    first: 10,
    tagId,  // null when no filter
  })

  return (
    <div>
      {/* Tag filter chips */}
      <div>
        {data.library.tags.map(tag => (
          <TagChip
            key={tag.id}
            tag={tag}
            selected={tag.id === tagId}
            onClick={() => setTagId(tag.id)}  // updates URL to ?tag=xxx
          />
        ))}
        {tagId && <button onClick={() => setTagId(null)}>Clear</button>}
      </div>

      {/* Story list */}
      {data.library.stories.edges.map(edge => (
        <StoryRow key={edge.node.id} story={edge.node} />
      ))}
    </div>
  )
}
```

## Error Handling

| Layer | Error Type | Handling |
|-------|------------|----------|
| Spellbook handlers | SqlError | Auto-caught via `wrapHandlers` → die |
| Spellcaster | RPC errors | Propagate as Effect failures |
| RequestResolver | Batch failures | Complete all requests with failure |
| GraphQL resolver | Effect failures | Caught by `resolver()`, returned as GraphQL errors |
| Relay | GraphQL errors | Available in mutation `onError` / query `error` |

## Data Flow Examples

### List Query (with embedded tags)
```
LibraryQuery
  → me.library.stories(first: 10)
    → resolver yields Auth.required
    → resolver yields LibraryClient
    → client.listStories({first: 10})
      → Spellcaster.make → RPC to Library DO
      → Stories returned with tags already embedded
    → toConnection() transforms to Relay format
    → returns StoryConnection
```

### Single Story (batched via node query)
```
node(id: "story_xxx")
  → resolver detects story_ prefix
  → loadStory("story_xxx")
    → Effect.request(GetStory)
    → StoryResolver batches if multiple in same tick
    → client.getBatchStory({ids: [...]})
  → returns Story | null
```

### Mutation
```
CreateStoryMutation
  → createStory(url, title, description, tagIds)
    → resolver yields Auth.required
    → resolver yields LibraryClient
    → client.createStory(input)
    → returns {story}
  → Relay updater prepends story to connection
  → UI re-renders with new story (optimistic first, then confirmed)
```

### Tag Filter (URL state)
```
User clicks tag chip
  → setTagFilter(tagId) updates effect-atom
  → URL changes to ?tag=xxx
  → React re-renders with new tagId
  → Suspense boundary triggers LibraryByTagQuery
  → storiesByTag(tagName, first) returns filtered connection
```
