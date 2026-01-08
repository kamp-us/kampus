# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Development Commands

```bash
pnpm install              # Install dependencies
turbo run dev             # Start all dev servers
turbo run lint            # Run linting
turbo run test            # Run tests
turbo run build           # Build all apps
```

### App-Specific Commands

```bash
# Frontend (kamp-us)
pnpm --filter kamp-us run dev          # Vite dev server

# Backend (worker)
pnpm --filter worker run dev           # Wrangler dev server
pnpm --filter worker run test          # Run Vitest tests
```

## Development Rules

Before committing, ensure code passes:
1. `biome check --write --staged` - Fix formatting/linting on staged files only
2. `pnpm --filter worker exec tsc --noEmit` - Type check worker

Never commit code with lint errors or type failures.

**Important:** Always use `pnpm exec` instead of `npx` for running package binaries.

Note: `biome.jsonc` excludes `__generated__/` directories via `files.includes`. Use `biome check --write .` to check all files if needed.

## Architecture

```
apps/
├── kamp-us/   # React frontend (Cloudflare Worker)
├── worker/    # Backend API (Cloudflare Worker + Durable Objects)
└── cli/       # Effect-based CLI application
```

**Request flow:**
```
Browser → kamp-us Worker → Backend Worker (service binding)
           ├─ /rpc/*      → Effect RPC (Durable Objects)
           ├─ /api/auth/* → Better Auth
           └─ static      → Vite assets
```

## Actor Model (Durable Objects)

Each Durable Object is an **actor** with:
- **Single-threaded execution** - No concurrency within instance, no locks needed
- **Isolated state** - Own SQLite database, no shared memory
- **Message passing** - Communication via RPC stubs
- **Location transparency** - Cloudflare routes to correct instance

### Design Principles

- **Model around the "atom" of coordination** - Each DO represents one logical entity (user, document, room)
- **Use `idFromName()` for routing** - Same input always routes to same instance
- **Prefer RPC methods over `fetch()` handler** - Better type safety, no manual parsing
- **Always await RPC calls** - Unawaited calls create dangling promises, errors get swallowed
- **Return null for missing entities, don't throw** - When looking up by ID, return `null` if not found instead of throwing errors. This simplifies error handling and avoids RPC serialization issues with custom error classes

### Storage Rules

- **Initialize with `blockConcurrencyWhile()`** - Run migrations in constructor, no requests until complete
- **Persist critical state to SQLite first** - Then update in-memory caches
- **Create indexes for frequently-queried columns** - Dramatically improves read performance
- **Use `transaction()` for atomic read-modify-write** - Not `blockConcurrencyWhile()` on every request

### Concurrency Gotchas

- **Input gates only protect during storage ops** - `fetch()` calls allow interleaving
- **Non-storage I/O can cause race conditions** - Use check-and-set patterns
- **`blockConcurrencyWhile()` limits throughput** - ~5ms per call = max 200 req/sec

### Anti-patterns

- **Global singletons** - One DO handling all requests becomes a bottleneck
- **Passing DO instances directly** - Use IDs, get stubs from env bindings
- **Unawaited RPC calls** - Errors swallowed, return values lost
- **Storing everything in parent DO** - Use parent-child relationships for parallelism

### Alarms & Scheduling

Use alarms for per-entity scheduled tasks:
```typescript
// Schedule future work
await this.ctx.storage.setAlarm(Date.now() + 60_000) // 1 minute

// Handle in alarm() method
async alarm() {
  await this.processScheduledWork()
  // Re-schedule if recurring (alarms don't repeat automatically)
  if (this.shouldContinue) {
    await this.ctx.storage.setAlarm(Date.now() + 60_000)
  }
}
```

**Rules:**
- Make alarm handlers idempotent (may fire multiple times)
- Only schedule alarms when work is needed
- Call `deleteAlarm()` before `deleteAll()` when cleaning up

### WebSockets & Hibernation

Use Hibernatable WebSockets API to reduce costs for idle connections:
```typescript
async fetch(request: Request) {
  const [client, server] = Object.values(new WebSocketPair())

  // Accept with hibernation support
  this.ctx.acceptWebSocket(server)

  // Store per-connection state (survives hibernation)
  server.serializeAttachment({userId: "user_123", joinedAt: Date.now()})

  return new Response(null, {status: 101, webSocket: client})
}

async webSocketMessage(ws: WebSocket, message: string) {
  const state = ws.deserializeAttachment()
  // Handle message with connection state
}
```

**Benefits:**
- DO can sleep while maintaining connections
- Significantly reduces costs for chat/realtime apps

### Error Handling & Retries

When calling DOs from Workers, handle transient failures:
```typescript
async function callDOWithRetry(stub: DurableObjectStub, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await stub.someMethod()
    } catch (error) {
      if (error.retryable) {
        await sleep(Math.pow(2, i) * 100) // Exponential backoff
        continue
      }
      if (error.overloaded) {
        await sleep(1000) // Back off more for overload
        continue
      }
      throw error // Non-retryable, rethrow
    }
  }
}
```

**Error properties:**
- `.retryable` - Transient failure, safe to retry
- `.overloaded` - DO is overloaded, back off longer

## Development Workflow - Spec-Driven Development

This project follows a **spec-driven development** approach where every feature is thoroughly specified before implementation.

**CRITICAL RULE: NEVER IMPLEMENT WITHOUT FOLLOWING THE COMPLETE SPEC FLOW**

### Mandatory Workflow Steps

**AUTHORIZATION PROTOCOL**: Before proceeding to any phase (2-5), you MUST:
1. Present the completed work from the current phase
2. Explicitly ask for user authorization to proceed
3. Wait for clear user approval before continuing
4. NEVER assume permission or proceed automatically

### Phase-by-Phase Process

| Phase | Deliverable | Gate |
| ----- | ----------- | ---- |
| 1 | `instructions.md` - capture user requirements, stories, acceptance criteria | — |
| 2 | `requirements.md` - structured functional/non-functional requirements | **REQUIRES APPROVAL** |
| 3 | `design.md` - technical design, architecture, Effect patterns | **REQUIRES APPROVAL** |
| 4 | `plan.md` - implementation roadmap and task breakdown | **REQUIRES APPROVAL** |
| 5 | Implementation - follow the plan exactly | **REQUIRES APPROVAL** |

### Specification Structure

```
specs/
├── README.md                    # Feature directory with completion status
└── [feature-name]/
    ├── instructions.md          # Initial requirements capture
    ├── requirements.md          # Structured requirements analysis
    ├── design.md                # Technical design and architecture
    └── plan.md                  # Implementation roadmap and progress
```

**`specs/README.md`**: Simple checkbox list of features
```markdown
- [x] **[feature-name](./feature-name/)** - Brief description
- [ ] **[another-feature](./another-feature/)** - Brief description
```

### Best Practices

- **One feature per spec folder**: Keep features focused and manageable
- **Iterative refinement**: Specs can evolve but major changes should be documented
- **Cross-reference**: Link between instruction/requirement/design/plan files
- **Progress tracking**: Update plan.md regularly during implementation
- **Effect-first design**: Consider Effect patterns and error handling in design phase

## Patterns & Conventions

### Design System

Components in `apps/kamp-us/src/design/` follow these patterns:

- Each component has a `.tsx` file paired with a `.module.css` file
- Components extend **Base UI** primitives (`@base-ui/react/*`)
- Props **omit `className`** to prevent style overrides—this is intentional
- State styling uses data attributes: `[data-focused]`, `[data-invalid]`, `[data-disabled]`
- Design tokens live in `phoenix.ts` (types) and `phoenix.css` (CSS variables)

**When working with the design system:**
- Never apply custom styles via `className` or inline styles
- Add new variants to existing components rather than one-off styles
- For complex components, use the compound component pattern (see Fieldset)

### Frontend Stack

The `kamp-us` app uses:

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **effect-atom** - Reactive state management with Effect integration
- **@effect/rpc** - Type-safe RPC client
- **react-router** - Client-side routing
- **CSS Modules** - Scoped styling (`.module.css` files)
- **Base UI** - Unstyled component primitives

**Important:** Import from `react-router`, not `react-router-dom`:
```typescript
import {Link, useSearchParams, useNavigate} from "react-router";
```

### Backend Features

Features in `apps/worker/src/features/` follow a standard structure:

```
feature-name/
├── FeatureName.ts      # Durable Object class
├── schema.ts           # Effect Schema definitions
└── drizzle/
    ├── drizzle.schema.ts   # Database schema
    └── migrations/         # SQL migrations
```

**Conventions:**
- Durable Objects extend `DurableObject<Env>` with migrations in constructor
- Use `Schema.Struct()` not `Schema.Class()` (DOs can't return class instances)
- ID generation: `id("prefix")` from `@usirin/forge` (e.g., `id("story")`, `id("user")`)
- Export DO classes from `src/index.ts`, add bindings in `wrangler.jsonc`

### Code Style

Uses **Biome** for formatting and linting:

- Line width: 100
- Bracket spacing: false (`{foo}` not `{ foo }`)
- Run `biome check .` or `biome format . --write`

## Effect Best Practices

### Sequential Operations
Use `Effect.gen()` with generators, not `.pipe()` chains:
```typescript
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.profileId)
  return { user, profile }
})
```

### Error Handling
Define tagged errors in feature schema files:
```typescript
class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}
```

### Services
Use `Context.Tag` for dependency injection (preferred over `Effect.Service`):
```typescript
class MyService extends Context.Tag("MyService")<MyService, {
  readonly method1: () => Effect.Effect<void>
  readonly method2: (input: string) => Effect.Effect<string>
}>() {}

const MyServiceLive = Layer.succeed(MyService, {
  method1: () => Effect.void,
  method2: (input) => Effect.succeed(input.toUpperCase())
})
```

**Why Context.Tag over Effect.Service:**
- Explicit separation of tag (interface) and layer (implementation)
- Better composability with Layer combinators (`Layer.provide`, `Layer.merge`)
- `Effect.Service` is experimental and wraps `Context.Tag` internally

### Schema
Use `Schema.Struct()` for data structures (not classes in DO context):
```typescript
const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
})
```

### Bridging Promises
Wrap external Promise APIs:
```typescript
const result = yield* Effect.promise(() => externalAsyncCall())
```

## Effect RPC

`@effect/rpc` provides type-safe RPC with automatic serialization. Used for communication between frontend and Durable Objects.

### Defining RPC Schemas (Shared Package)

Define schemas in a shared package (e.g., `packages/library/src/rpc.ts`):
```typescript
import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";

// Define request/response schemas
const GetStory = Rpc.make("getStory", {
  payload: Schema.Struct({id: Schema.String}),
  success: Schema.NullOr(StorySchema),
});

const ListStories = Rpc.make("listStories", {
  payload: Schema.Struct({
    first: Schema.optional(Schema.Number),
    after: Schema.optional(Schema.String),
  }),
  success: Schema.Struct({
    stories: Schema.Array(StorySchema),
    hasNextPage: Schema.Boolean,
    endCursor: Schema.NullOr(Schema.String),
    totalCount: Schema.Number,
  }),
});

// Group all RPCs together
export const LibraryRpcs = RpcGroup.make(GetStory, ListStories, CreateStory, /* ... */);
```

### RPC Server in Durable Object

Use `RpcServer.toHttpApp` with `ManagedRuntime` - **never use `as any` type casts**:
```typescript
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {LibraryRpcs} from "@kampus/library";
import {Effect, Layer, ManagedRuntime} from "effect";

export class Library extends DurableObject<Env> {
  db = drizzle(this.ctx.storage, {schema});

  // Handlers use Effect.promise for Drizzle operations
  private handlers = {
    getStory: ({id}: {id: string}) =>
      Effect.promise(async () => {
        const story = this.db.select().from(schema.story)
          .where(eq(schema.story.id, id)).get();
        if (!story) return null;
        return {
          id: story.id,
          title: story.title,
          createdAt: story.createdAt.toISOString(),
        };
      }),

    listStories: ({first, after}: {first?: number; after?: string}) =>
      Effect.promise(async () => {
        // ... database queries using .get(), .all()
        return {stories, hasNextPage, endCursor, totalCount};
      }),
  };

  // Layer provides handlers + JSON serialization + Scope
  private handlerLayer = Layer.mergeAll(
    LibraryRpcs.toLayer(this.handlers),
    RpcSerialization.layerJson,
    Layer.scope,
  );

  // ManagedRuntime for running effects
  private runtime = ManagedRuntime.make(this.handlerLayer);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const program = Effect.gen(function* () {
      const httpApp = yield* RpcServer.toHttpApp(LibraryRpcs);
      const response = yield* httpApp.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request)
        )
      );
      return HttpServerResponse.toWeb(response);
    });
    return this.runtime.runPromise(program);
  }
}
```

**Key patterns:**
- Use arrow functions for handlers to preserve `this` binding
- Include `Layer.scope` in the handler layer for `toHttpApp`
- `ManagedRuntime.make(layer)` provides proper type inference
- `HttpServerRequest.fromWeb(request)` converts web Request
- `HttpServerResponse.toWeb(response)` converts back (returns Response directly, not Effect)
- **Never use `toWebHandler` in DOs** - it requires `HttpRouter.DefaultServices` (HttpPlatform, FileSystem, etc.)

### RPC Error Handling

Define typed errors in the shared package using `Schema.TaggedError`:
```typescript
// packages/library/src/errors.ts
export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()(
  "InvalidUrlError",
  {url: Schema.String}
) {}

// Add error channel to RPC definition
Rpc.make("createStory", {
  payload: {...},
  success: Story,
  error: InvalidUrlError,  // Typed error channel
})
```

**Use `Effect.gen` + `Effect.fail` for typed errors** (not `throw` inside `Effect.promise`):
```typescript
// ❌ DON'T: throw inside Effect.promise (becomes untyped defect)
createStory: ({url}) => Effect.promise(async () => {
  if (!isValidUrl(url)) throw new Error("Invalid URL");  // Lost type info!
})

// ✅ DO: Use Effect.gen with Effect.fail for typed errors
createStory: ({url}) => Effect.gen(this, function* () {
  if (!isValidUrl(url)) {
    return yield* Effect.fail(new InvalidUrlError({url}));
  }
  // Sync DB operations work directly in generator (Drizzle is sync)
  return this.db.insert(schema.story).values({url}).returning().get();
})
```

### RPC Client with effect-atom

Use `AtomRpc.Tag` for type-safe RPC client with auth and error handling:
```typescript
import {FetchHttpClient, HttpClient, HttpClientRequest} from "@effect/platform";
import {RpcClient, RpcSerialization} from "@effect/rpc";
import {AtomRpc} from "@effect-atom/atom";
import {LibraryRpcs, UnauthorizedError} from "@kampus/library";
import {Effect, Layer} from "effect";

export class LibraryRpc extends AtomRpc.Tag<LibraryRpc>()("LibraryRpc", {
  group: LibraryRpcs,
  protocol: RpcClient.layerProtocolHttp({
    url: "/rpc/library",
    transformClient: (client) => client.pipe(
      // Add auth header
      HttpClient.mapRequest((req) => {
        const token = getStoredToken();
        return token ? HttpClientRequest.bearerToken(req, token) : req;
      }),
      // Handle 401 with typed error
      HttpClient.transformResponse(
        Effect.flatMap((r) => r.status === 401
          ? Effect.fail(new UnauthorizedError())
          : Effect.succeed(r))
      ),
    ),
  }).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provide(FetchHttpClient.layer)),
}) {}
```

Define query and mutation atoms with `reactivityKeys` for cache invalidation:
```typescript
// Query atoms - invalidated when matching mutation fires
export const storiesAtom = LibraryRpc.query("listStories", {}, {
  reactivityKeys: ["stories"],
});

export const tagsAtom = LibraryRpc.query("listTags", undefined, {
  reactivityKeys: ["tags"],
});

// Mutation atoms
export const createStoryMutation = LibraryRpc.mutation("createStory");
export const deleteStoryMutation = LibraryRpc.mutation("deleteStory");
```

## effect-atom Best Practices

effect-atom is a reactive state management library for Effect with fine-grained atoms and full Effect ecosystem integration.

### Basic Atoms
```typescript
import {Atom, Registry} from "@effect-atom/atom"

// Simple writable atom
const countAtom = Atom.make(0)

// Derived atom (read-only, auto-updates)
const doubleCountAtom = Atom.make((get) => get(countAtom) * 2)

// Using atoms
const registry = Registry.make()
registry.get(countAtom)       // 0
registry.set(countAtom, 5)
registry.get(doubleCountAtom) // 10
```

### Effect-based Atoms
Async atoms return `Result<A, E>` (Initial | Success | Failure):
```typescript
const userAtom = Atom.make(
  Effect.gen(function*() {
    const response = yield* HttpClient.get("/api/user")
    return yield* response.json
  })
)
```

### Runtime Atoms with Services
Use `Atom.runtime()` for atoms depending on Effect services:
```typescript
const runtimeAtom = Atom.runtime(MyService.Default)

// Read-only atom with service
const dataAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const service = yield* MyService
    return yield* service.getData()
  })
)

// Function atom for mutations
const updateAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(input: string) {
    const service = yield* MyService
    return yield* service.update(input)
  })
)
```

### Atom Families
Dynamic atoms keyed by identifier:
```typescript
const userByIdAtom = Atom.family((userId: string) =>
  runtimeAtom.atom(
    Effect.gen(function*() {
      const users = yield* Users
      return yield* users.findById(userId)
    })
  )
)

const user1 = userByIdAtom("user-1") // Same key = same instance
```

### React Hooks
```typescript
import {useAtomValue, useAtomSet, useAtom} from "@effect-atom/atom-react"

const count = useAtomValue(countAtom)           // Read
const setCount = useAtomSet(countAtom)          // Write
const [count, setCount] = useAtom(countAtom)    // Both
```

### Result.builder for UI Rendering

Use `Result.builder` (not `Result.match`) for rendering async results:
```tsx
function StoriesList() {
  const storiesResult = useAtomValue(storiesAtom);

  return Result.builder(storiesResult)
    .onDefect((defect) => <div>Error: {String(defect)}</div>)
    .onSuccess((data, {waiting}) => (
      <>
        {waiting && <div>Refreshing...</div>}
        {data.stories.map(story => <StoryRow key={story.id} story={story} />)}
      </>
    ))
    .render();
}
```

**Why `Result.builder` over `Result.match`:**
- `onSuccess` receives unwrapped value `T`, not `Success<T>` wrapper
- Second arg `{waiting}` indicates background refresh in progress
- `.render()` returns `null` for initial state (no skeleton flash)

### Fire-and-Forget Mutations

Mutations don't need return values when using `reactivityKeys`:
```typescript
const createStory = useAtomSet(createStoryMutation);

const handleSubmit = () => {
  createStory({
    payload: {title, url},
    reactivityKeys: ["stories"],  // Invalidates storiesAtom
  });
  // Reset form immediately - don't await
  setTitle(""); setUrl("");
};
```

The mutation fires, `reactivityKeys` triggers cache invalidation, queries refetch automatically.

### Key Patterns
- `Atom.make(value)` - simple state
- `Atom.make((get) => ...)` - derived state
- `Atom.runtime(layer)` - atoms needing Effect services
- `runtimeAtom.atom(effect)` - async operations
- `runtimeAtom.fn(effect)` - mutations/actions
- `Atom.family(keyFn)` - dynamic/parameterized atoms
- Wrap React app in `<RegistryProvider>` for hooks

## Principles

- **Effect.ts** for all async/error handling—not raw Promises
- **Effect Schema** for data structures—not Zod or plain TypeScript interfaces
- **Base UI** for interactive components—extend, don't rebuild
- **Drizzle + SQLite** for persistence in Durable Objects—not KV
- Keep Durable Objects focused: one responsibility per DO

## Testing

Worker tests use Vitest with Cloudflare's test pool:
```bash
pnpm --filter worker run test
```

Test files: `apps/worker/test/*.spec.ts`

**Pattern:**
```typescript
import { env, SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

describe('Feature', () => {
  it('works', async () => {
    const response = await SELF.fetch('https://example.com/endpoint')
    expect(response.status).toBe(200)
  })
})
```

## Common Gotchas

- **DO can't return class instances** - Use `Schema.Struct()`, not `Schema.Class()`
- **Don't run `turbo dev` automatically** - User starts dev servers manually
- **Design system className** - Props intentionally omit it; don't try to add styles
- **Result.builder vs Result.match** - `onSuccess` in `Result.match` gets `Success<T>` wrapper; `Result.builder` unwraps to `T`
- **Effect.promise swallows error types** - Use `Effect.gen` + `Effect.fail` for typed RPC errors
- **Import errors from shared package** - Use `Schema.TaggedError` from `@kampus/library`, not `Data.TaggedError` locally
- **401 in RPC client** - Add `HttpClient.transformResponse` to convert HTTP 401 to typed `UnauthorizedError`

## Reference Implementations

Study these patterns before implementing similar features.

### Durable Object with Drizzle

**Schema** (`drizzle/drizzle.schema.ts`):
```typescript
import {id} from "@usirin/forge";
import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

export const story = sqliteTable(
  "story",
  {
    id: text("id").primaryKey().$defaultFn(() => id("story")),
    url: text("string"),
    normalizedUrl: text("string"),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_story_normalized_url").on(table.normalizedUrl),
    index("idx_story_created_at").on(table.createdAt),
  ],
);
```

**Durable Object** (`Library.ts`):
```typescript
import {DurableObject} from "cloudflare:workers";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";

// keyed by user id
export class Library extends DurableObject<Env> {
  db = drizzle(this.ctx.storage, {schema});

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  async createStory(options: {url: string; title: string; description?: string}) {
    const [story] = await this.db
      .insert(schema.story)
      .values({...options, normalizedUrl: getNormalizedUrl(options.url)})
      .returning();
    return story;
  }
}
```

### Service with Context.Tag

```typescript
class KampusStateStorage extends Context.Tag("cli/services/KampusStateStorage")<
  KampusStateStorage,
  {
    readonly loadState: Effect.Effect<KampusState>
    readonly saveState: (state: KampusState) => Effect.Effect<void>
  }
>() {}

const KampusStateStorageLive = Layer.effect(
  KampusStateStorage,
  Effect.gen(function* () {
    const kv = (yield* KeyValueStore).forSchema(KampusState)
    return {
      loadState: Effect.gen(function* () {
        return (yield* kv.get("state")).pipe(
          Option.getOrElse(() => KampusState.make({}))
        )
      }),
      saveState: (state) => kv.set("state", state)
    }
  })
).pipe(Layer.provide(BunKeyValueStore.layerFileSystem(KAMPUS_DIR)))
```

### Tagged Error

```typescript
export class KampusConfigError<Method extends string> extends Data.TaggedError(
  "@kampus/cli/services/KampusConfigError",
)<{
  method: Method;
  cause: unknown;
}> {}
```

## Finding Things

| What | Where |
| ------ | ------- |
| Feature specs | `specs/[feature-name]/` |
| Design tokens | `apps/kamp-us/src/design/phoenix.{ts,css}` |
| RPC definitions | `packages/library/src/rpc.ts` |
| Domain errors | `packages/library/src/errors.ts` |
| RPC client | `apps/kamp-us/src/rpc/client.ts` |
| RPC atoms | `apps/kamp-us/src/rpc/atoms.ts` |
| Feature implementations | `apps/worker/src/features/*/` |
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
| Local effect-atom source | `~/code/github.com/usirin/effect-atom/` |
