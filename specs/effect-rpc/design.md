# Effect RPC Technical Design

## Architecture Overview

The Library Durable Object itself serves as the RPC server. This keeps the actor model clean - each DO owns its complete interface.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React App (effect-atom)                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ storiesAtom │  │ tagsAtom    │  │ createStoryMut  │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  │         │                │                  │            │   │
│  │         └────────────────┼──────────────────┘            │   │
│  │                          ▼                               │   │
│  │              LibraryRpcClient (AtomRpc)                  │   │
│  │                          │                               │   │
│  └──────────────────────────┼───────────────────────────────┘   │
│                             │ HTTP POST /rpc/library             │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   kamp-us Worker (Frontend)                      │
│                                                                  │
│   if (pathname.startsWith("/rpc"))                              │
│     return env.BACKEND.fetch(request)  ──────────────────────┐  │
│                                                               │  │
└───────────────────────────────────────────────────────────────┼──┘
                              Service Binding                   │
┌───────────────────────────────────────────────────────────────┼──┐
│                   worker (Backend)                            ▼  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Hono Router                                                │ │
│  │    /api/auth/*    → Pasaport DO                            │ │
│  │    /graphql       → GraphQL Yoga                           │ │
│  │    /rpc/library/* → Auth + Route to Library DO             │ │
│  │    /rpc/pasaport/* → (future) Route to Pasaport DO         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│       1. validateSession(headers) → {user, session}             │
│       2. env.LIBRARY.idFromName(userId)                         │
│       3. Forward request to library.fetch(request)              │
│                             │                                    │
│                             ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Library Durable Object (per-user)                          │ │
│  │    ┌──────────────────────────────────────────────────┐    │ │
│  │    │  RPC Server (Effect RPC)                          │    │ │
│  │    │    - LibraryRpcs handlers                         │    │ │
│  │    │    - Direct access to SQLite via Drizzle          │    │ │
│  │    │    - No auth (trusted context from Worker)        │    │ │
│  │    └──────────────────────────────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Points

1. **Domain-scoped RPC routing** - `/rpc/{domain}/*` pattern allows multiple DOs to expose RPC
2. **Worker handles authentication only** - Validates session, determines user ID, routes to correct DO
3. **Library DO serves RPC** - The `fetch()` handler processes RPC requests directly
4. **Trusted context** - DO trusts that requests reaching it are authorized (worker enforces auth)
5. **Actor model preserved** - Each user's Library DO owns its complete interface

## Backend Design

### 1. Library Domain Package (`packages/library/`)

Domain-scoped package following DDD principles. The Library domain owns:
- Entity schemas (Story, Tag)
- Domain errors
- RPC contract (LibraryRpcs)

```
packages/library/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        # Re-exports
    ├── schema.ts       # Entity schemas
    ├── errors.ts       # Domain errors
    └── rpc.ts          # RPC group definition
```

#### Entity Schemas (`packages/library/src/schema.ts`)

```typescript
// packages/library/src/schema.ts
import {Schema} from "effect"

// Core entities
export const Story = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})
export type Story = typeof Story.Type

export const Tag = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  createdAt: Schema.String,
})
export type Tag = typeof Tag.Type

// Pagination
export const PaginationInput = Schema.Struct({
  first: Schema.optional(Schema.Int.pipe(Schema.positive())),
  after: Schema.optional(Schema.String),
})
export type PaginationInput = typeof PaginationInput.Type

export const StoriesPage = Schema.Struct({
  stories: Schema.Array(Story),
  hasNextPage: Schema.Boolean,
  endCursor: Schema.NullOr(Schema.String),
  totalCount: Schema.Int,
})
export type StoriesPage = typeof StoriesPage.Type
```

#### Domain Errors (`packages/library/src/errors.ts`)

```typescript
// packages/library/src/errors.ts
import {Schema} from "effect"

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

export class StoryNotFoundError extends Schema.TaggedError<StoryNotFoundError>()(
  "StoryNotFoundError",
  {storyId: Schema.String}
) {}

export class TagNotFoundError extends Schema.TaggedError<TagNotFoundError>()(
  "TagNotFoundError",
  {tagId: Schema.String}
) {}

export class TagNameExistsError extends Schema.TaggedError<TagNameExistsError>()(
  "TagNameExistsError",
  {tagName: Schema.String}
) {}

export class InvalidTagNameError extends Schema.TaggedError<InvalidTagNameError>()(
  "InvalidTagNameError",
  {message: Schema.String}
) {}

export class InvalidTagColorError extends Schema.TaggedError<InvalidTagColorError>()(
  "InvalidTagColorError",
  {color: Schema.String}
) {}
```

#### RPC Contract (`packages/library/src/rpc.ts`)

```typescript
// packages/library/src/rpc.ts
import {Schema} from "effect"
import {Rpc, RpcGroup} from "@effect/rpc"
import {Story, Tag, PaginationInput, StoriesPage} from "./schema"
import * as Errors from "./errors"

export class LibraryRpcs extends RpcGroup.make(
  // Story operations
  Rpc.make("getStory", {
    payload: {id: Schema.String},
    success: Schema.NullOr(Story),
    error: Errors.UnauthorizedError,
  }),
  Rpc.make("listStories", {
    payload: PaginationInput,
    success: StoriesPage,
    error: Errors.UnauthorizedError,
  }),
  Rpc.make("createStory", {
    payload: {
      url: Schema.String,
      title: Schema.String,
      description: Schema.optional(Schema.String),
      tagIds: Schema.optional(Schema.Array(Schema.String)),
    },
    success: Story,
    error: Errors.UnauthorizedError,
  }),
  Rpc.make("updateStory", {
    payload: {
      id: Schema.String,
      title: Schema.optional(Schema.String),
      description: Schema.optional(Schema.NullOr(Schema.String)),
      tagIds: Schema.optional(Schema.Array(Schema.String)),
    },
    success: Schema.NullOr(Story),
    error: Schema.Union(Errors.UnauthorizedError, Errors.StoryNotFoundError),
  }),
  Rpc.make("deleteStory", {
    payload: {id: Schema.String},
    success: Schema.Struct({deleted: Schema.Boolean}),
    error: Errors.UnauthorizedError,
  }),

  // Tag operations
  Rpc.make("listTags", {
    payload: {},
    success: Schema.Array(Tag),
    error: Errors.UnauthorizedError,
  }),
  Rpc.make("createTag", {
    payload: {name: Schema.String, color: Schema.String},
    success: Tag,
    error: Schema.Union(
      Errors.UnauthorizedError,
      Errors.TagNameExistsError,
      Errors.InvalidTagNameError,
      Errors.InvalidTagColorError
    ),
  }),
  Rpc.make("updateTag", {
    payload: {
      id: Schema.String,
      name: Schema.optional(Schema.String),
      color: Schema.optional(Schema.String),
    },
    success: Schema.NullOr(Tag),
    error: Schema.Union(
      Errors.UnauthorizedError,
      Errors.TagNotFoundError,
      Errors.TagNameExistsError,
      Errors.InvalidTagNameError,
      Errors.InvalidTagColorError
    ),
  }),
  Rpc.make("deleteTag", {
    payload: {id: Schema.String},
    success: Schema.Struct({deleted: Schema.Boolean}),
    error: Errors.UnauthorizedError,
  }),

  // Tag-Story relationships
  Rpc.make("getTagsForStory", {
    payload: {storyId: Schema.String},
    success: Schema.Array(Tag),
    error: Errors.UnauthorizedError,
  }),
  Rpc.make("setStoryTags", {
    payload: {storyId: Schema.String, tagIds: Schema.Array(Schema.String)},
    success: Schema.Struct({success: Schema.Boolean}),
    error: Errors.UnauthorizedError,
  }),
) {}
```

#### Package Exports (`packages/library/src/index.ts`)

```typescript
// packages/library/src/index.ts
export * from "./schema"
export * from "./errors"
export {LibraryRpcs} from "./rpc"
```

### 2. Library DO with RPC Server (`apps/worker/src/features/library/Library.ts`)

The Library Durable Object serves the RPC server directly via its `fetch()` handler:

```typescript
// apps/worker/src/features/library/Library.ts
import {DurableObject} from "cloudflare:workers"
import {drizzle} from "drizzle-orm/durable-sqlite"
import {migrate} from "drizzle-orm/durable-sqlite/migrator"
import {Effect, Layer, ManagedRuntime} from "effect"
import {RpcServer, RpcSerialization} from "@effect/rpc"
import {HttpRouter, HttpServer} from "@effect/platform"
import {LibraryRpcs} from "@kampus/library"
import * as schema from "./drizzle/drizzle.schema"
import migrations from "./drizzle/migrations/migrations"

export class Library extends DurableObject<Env> {
  db = drizzle(this.ctx.storage, {schema})
  private rpcRuntime: ManagedRuntime.ManagedRuntime<never, never> | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations)
      // Initialize RPC runtime
      this.rpcRuntime = await this.createRpcRuntime()
    })
  }

  private async createRpcRuntime() {
    const handlers = this.createRpcHandlers()

    const rpcLayer = LibraryRpcs.toLayer(handlers).pipe(
      Layer.provideMerge(RpcServer.layer(LibraryRpcs)),
      Layer.provideMerge(RpcSerialization.layerJson),
    )

    return ManagedRuntime.make(rpcLayer)
  }

  private createRpcHandlers() {
    // Return handler implementations with direct DB access
    return {
      // Story operations
      getStory: ({id}) =>
        Effect.tryPromise(() => this.getStory(id)),

      listStories: ({first, after}) =>
        Effect.tryPromise(async () => {
          const result = await this.listStories({first, after})
          return {
            stories: result.edges.map(toStoryDto),
            hasNextPage: result.hasNextPage,
            endCursor: result.endCursor,
            totalCount: result.totalCount,
          }
        }),

      createStory: ({url, title, description, tagIds}) =>
        Effect.tryPromise(async () => {
          const story = await this.createStory({url, title, description})
          if (tagIds?.length) {
            await this.tagStory(story.id, tagIds)
          }
          return toStoryDto(story)
        }),

      updateStory: ({id, title, description, tagIds}) =>
        Effect.tryPromise(async () => {
          const story = await this.updateStory(id, {title, description})
          if (!story) return null
          if (tagIds !== undefined) {
            await this.setStoryTags(id, tagIds)
          }
          return toStoryDto(story)
        }),

      deleteStory: ({id}) =>
        Effect.tryPromise(async () => {
          await this.deleteStory(id)
          return {deleted: true}
        }),

      // Tag operations
      listTags: () =>
        Effect.tryPromise(() => this.listTags().then(tags => tags.map(toTagDto))),

      createTag: ({name, color}) =>
        Effect.tryPromise(() => this.createTag(name, color).then(toTagDto)),

      updateTag: ({id, name, color}) =>
        Effect.tryPromise(() => this.updateTag(id, {name, color}).then(t => t ? toTagDto(t) : null)),

      deleteTag: ({id}) =>
        Effect.tryPromise(async () => {
          await this.deleteTag(id)
          return {deleted: true}
        }),

      // Tag-Story relationships
      getTagsForStory: ({storyId}) =>
        Effect.tryPromise(() => this.getTagsForStory(storyId).then(tags => tags.map(toTagDto))),

      setStoryTags: ({storyId, tagIds}) =>
        Effect.tryPromise(async () => {
          await this.setStoryTags(storyId, tagIds)
          return {success: true}
        }),
    }
  }

  // RPC endpoint via fetch handler
  async fetch(request: Request): Promise<Response> {
    if (!this.rpcRuntime) {
      return new Response("RPC not initialized", {status: 503})
    }

    const handler = RpcServer.toHttpApp(LibraryRpcs)
    return this.rpcRuntime.runPromise(
      Effect.flatMap(handler, (app) => app(request))
    )
  }

  // Existing methods (getStory, listStories, createStory, etc.)
  // ... unchanged ...
}

// DTO helpers
function toStoryDto(story: any) {
  return {
    id: story.id,
    url: story.url,
    title: story.title,
    description: story.description ?? null,
    createdAt: story.createdAt instanceof Date
      ? story.createdAt.toISOString()
      : story.createdAt,
  }
}

function toTagDto(tag: any) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt instanceof Date
      ? tag.createdAt.toISOString()
      : tag.createdAt,
  }
}
```

### 3. Worker Route (`apps/worker/src/index.ts`)

The worker handles authentication and routes to the correct DO based on the domain path:

```typescript
// apps/worker/src/index.ts
// ... existing imports ...

// Library RPC endpoint - auth + route to Library DO
app.all("/rpc/library/*", async (c) => {
  const env = c.env
  const headers = c.req.raw.headers

  // Validate session
  const pasaportId = env.PASAPORT.idFromName("kampus")
  const pasaport = env.PASAPORT.get(pasaportId)
  const sessionData = await pasaport.validateSession(headers)

  if (!sessionData?.user) {
    return c.json({error: "Unauthorized"}, 401)
  }

  // Route to user's Library DO
  const libraryId = env.LIBRARY.idFromName(sessionData.user.id)
  const library = env.LIBRARY.get(libraryId)

  // Forward request to Library DO's fetch handler
  return library.fetch(c.req.raw)
})

// Future: Add more domain RPC routes
// app.all("/rpc/pasaport/*", async (c) => { ... })

// ... existing routes ...
```

## Frontend Design

### 1. Frontend Worker Proxy Update

```typescript
// apps/kamp-us/worker/index.ts
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // Proxy RPC requests to the backend worker
    if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
      return env.BACKEND.fetch(request);
    }

    // ... existing routes ...
  },
} satisfies ExportedHandler<Env>;
```

### 2. RPC Client Setup (`apps/kamp-us/src/rpc/client.ts`)

```typescript
// apps/kamp-us/src/rpc/client.ts
import {Layer} from "effect"
import {RpcClient, RpcSerialization} from "@effect/rpc"
import {AtomRpc} from "@effect-atom/atom"
import {FetchHttpClient} from "@effect/platform"
import {LibraryRpcs} from "@kampus/library"

// RPC Client using AtomRpc
// Note: URL uses domain-scoped path /rpc/library
export class LibraryRpcClient extends AtomRpc.Tag<LibraryRpcClient>()(
  "LibraryRpcClient",
  {
    group: LibraryRpcs,
    protocol: RpcClient.layerProtocolHttp({
      url: "/rpc/library",
    }).pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer),
    ),
  }
) {}
```

### 3. Query and Mutation Atoms (`apps/kamp-us/src/rpc/atoms.ts`)

```typescript
// apps/kamp-us/src/rpc/atoms.ts
import {LibraryRpcClient} from "./client"
import type {Story, Tag, StoriesPage} from "@kampus/library"

// Story queries
export const storiesAtom = (options?: {first?: number; after?: string}) =>
  LibraryRpcClient.query("listStories", options ?? {})

export const storyAtom = (id: string) =>
  LibraryRpcClient.query("getStory", {id})

// Tag queries
export const tagsAtom = LibraryRpcClient.query("listTags", {})

export const storyTagsAtom = (storyId: string) =>
  LibraryRpcClient.query("getTagsForStory", {storyId})

// Story mutations
export const createStoryMutation = LibraryRpcClient.mutation("createStory")
export const updateStoryMutation = LibraryRpcClient.mutation("updateStory")
export const deleteStoryMutation = LibraryRpcClient.mutation("deleteStory")

// Tag mutations
export const createTagMutation = LibraryRpcClient.mutation("createTag")
export const updateTagMutation = LibraryRpcClient.mutation("updateTag")
export const deleteTagMutation = LibraryRpcClient.mutation("deleteTag")

// Tag-Story mutations
export const setStoryTagsMutation = LibraryRpcClient.mutation("setStoryTags")
```

### 4. React Integration (`apps/kamp-us/src/rpc/Provider.tsx`)

```typescript
// apps/kamp-us/src/rpc/Provider.tsx
import {RegistryProvider} from "@effect-atom/atom-react"
import {Registry} from "@effect-atom/atom"
import type {ReactNode} from "react"

const registry = Registry.make()

export function RpcProvider({children}: {children: ReactNode}) {
  return (
    <RegistryProvider registry={registry}>
      {children}
    </RegistryProvider>
  )
}
```

### 5. Test Page (`apps/kamp-us/src/pages/LibraryRpc.tsx`)

```typescript
// apps/kamp-us/src/pages/LibraryRpc.tsx
import {Suspense} from "react"
import {useAtomValue, useAtomSet} from "@effect-atom/atom-react"
import {Result} from "@effect-atom/atom"
import {Navigate} from "react-router"
import {useAuth} from "../auth/AuthContext"
import {
  storiesAtom,
  tagsAtom,
  createStoryMutation,
  deleteStoryMutation,
  createTagMutation,
} from "../rpc/atoms"
import styles from "./Library.module.css"  // Reuse existing styles

function StoriesList() {
  const storiesResult = useAtomValue(storiesAtom())

  return Result.match(storiesResult, {
    onInitial: () => <div>Loading stories...</div>,
    onFailure: (error) => <div>Error: {String(error)}</div>,
    onSuccess: (data) => (
      <div className={styles.storyList}>
        <p>{data.totalCount} stories</p>
        {data.stories.map((story) => (
          <StoryRow key={story.id} story={story} />
        ))}
        {data.hasNextPage && <button>Load More</button>}
      </div>
    ),
  })
}

function StoryRow({story}: {story: Story}) {
  const deleteStory = useAtomSet(deleteStoryMutation)

  const handleDelete = () => {
    deleteStory({
      payload: {id: story.id},
      reactivityKeys: {stories: ["all"]},
    })
  }

  return (
    <article className={styles.storyRow}>
      <a href={story.url} target="_blank" rel="noopener noreferrer">
        {story.title}
      </a>
      <button onClick={handleDelete}>Delete</button>
    </article>
  )
}

function TagsList() {
  const tagsResult = useAtomValue(tagsAtom)

  return Result.match(tagsResult, {
    onInitial: () => <div>Loading tags...</div>,
    onFailure: (error) => <div>Error: {String(error)}</div>,
    onSuccess: (tags) => (
      <div>
        <h3>Tags ({tags.length})</h3>
        {tags.map((tag) => (
          <span key={tag.id} style={{backgroundColor: `#${tag.color}`}}>
            {tag.name}
          </span>
        ))}
      </div>
    ),
  })
}

function LibraryRpcContent() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Library (RPC)</h1>
      </header>

      <Suspense fallback={<div>Loading...</div>}>
        <TagsList />
        <StoriesList />
      </Suspense>
    </div>
  )
}

export function LibraryRpc() {
  const {isAuthenticated} = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <LibraryRpcContent />
}
```

## File Structure

### New Files

```
packages/library/                 # Library domain package (DDD)
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                 # Re-exports
    ├── schema.ts                # Entity schemas (Story, Tag)
    ├── errors.ts                # Domain errors
    └── rpc.ts                   # LibraryRpcs contract

apps/kamp-us/src/rpc/
├── client.ts                    # LibraryRpcClient (AtomRpc)
├── atoms.ts                     # Query/mutation atoms
└── Provider.tsx                 # RegistryProvider wrapper

apps/kamp-us/src/pages/
└── LibraryRpc.tsx               # Test page (copy of Library.tsx with RPC)
```

### Modified Files

```
apps/worker/src/features/library/Library.ts  # Add RPC server (fetch handler)
apps/worker/src/index.ts                     # Add /rpc route (auth + forward to DO)
apps/kamp-us/worker/index.ts                 # Add /rpc proxy
apps/kamp-us/src/App.tsx                     # Add /me/library-rpc route
pnpm-workspace.yaml                          # Add packages/library
```

## Key Design Decisions

### 1. DO-as-RPC-Server
- Library DO serves RPC directly via `fetch()` handler
- Worker only handles authentication + routing to correct DO
- Keeps actor model clean - each DO owns its complete interface
- No separate RPC handler layer in the worker

### 2. Domain-Driven Design (DDD)
- `packages/library/` owns the Library domain
- Entity schemas, errors, and RPC contract co-located
- Worker imports for implementation, frontend imports for types
- Domain package is the source of truth

### 3. HTTP-Only (No WebSocket Initially)
- Simpler implementation
- Avoids WebSocket billing concerns
- Can add streaming later if needed

### 4. Trusted Context
- DO trusts that requests reaching it are authorized
- Worker enforces auth before forwarding to DO
- Clean separation: auth at edge, business logic in DO

### 5. Direct DB Access in Handlers
- RPC handlers call existing DO methods directly
- Methods access SQLite via Drizzle
- Wrap with `Effect.tryPromise()` for Effect integration

### 6. JSON Serialization
- Simpler than NDJSON for non-streaming
- Works with standard fetch
- Can switch to NDJSON if streaming needed
