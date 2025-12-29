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
pnpm --filter kamp-us run schema:fetch # Fetch GraphQL schema from backend
pnpm --filter kamp-us run relay        # Compile Relay artifacts

# Backend (worker)
pnpm --filter worker run dev           # Wrangler dev server
pnpm --filter worker run test          # Run Vitest tests
```

## Development Rules

Before committing, ensure code passes:
1. `biome check --write .` - Fix formatting/linting
2. `pnpm --filter worker exec tsc --noEmit` - Type check worker

Never commit code with lint errors or type failures.

## Architecture

```
apps/
├── kamp-us/   # React frontend (Cloudflare Worker)
├── worker/    # Backend GraphQL API (Cloudflare Worker)
└── cli/       # Effect-based CLI application
```

**Request flow:**
```
Browser → kamp-us Worker → Backend Worker (service binding)
           ├─ /graphql    → GraphQL Yoga
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

### GraphQL

- **GQLoom** (`@gqloom/core`, `@gqloom/effect`) for schema definition using Effect Schema
- **Relay** patterns for global IDs and cursor-based pagination
- Helpers in `apps/worker/src/graphql/relay.ts`: `encodeGlobalId`, `decodeGlobalId`, `createConnectionSchema`

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
Use `Effect.Service` for dependency injection:
```typescript
export class MyService extends Effect.Service<MyService>()("MyService", {
  effect: Effect.gen(function* () {
    // service implementation
    return { method1, method2 }
  }),
}) {}
```

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
- **Effect in worker** - Used via GQLoom's EffectWeaver, not direct Effect.gen
- **Relay artifacts** - Run `pnpm --filter kamp-us run relay` after schema changes
- **Design system className** - Props intentionally omit it; don't try to add styles

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

### Effect Service

```typescript
export class KampusStateStorage extends Effect.Service<KampusStateStorage>()(
  "cli/services/KampusStateStorage",
  {
    dependencies: [BunKeyValueStore.layerFileSystem(KAMPUS_DIR)],
    effect: Effect.gen(function* () {
      const kv = (yield* KeyValueStore).forSchema(KampusState);

      const loadState = Effect.fn("loadState")(function* () {
        return (yield* kv.get("state")).pipe(
          Option.getOrElse(() => KampusState.make({}))
        );
      });

      return { loadState, /* ... */ };
    }),
  },
) {}
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
| GraphQL schema | `apps/worker/src/graphql/` |
| Feature implementations | `apps/worker/src/features/*/` |
| Relay artifacts | `__generated__/` directories (auto-generated) |
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
