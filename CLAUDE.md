# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Development Commands

```bash
pnpm install              # Install dependencies
turbo run dev             # Start all dev servers
turbo run lint            # Run linting
turbo run typecheck       # Type check all apps
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
2. `turbo run typecheck` - Type check all apps

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
| 5 | `prd.json` - a json list of tasks with a structured represantation | **REQUIRES APPROVAL** |

### Specification Structure

```
specs/
├── README.md                    # Feature directory with completion status
└── [feature-name]/
    ├── instructions.md          # Initial requirements capture
    ├── requirements.md          # Structured requirements analysis
    ├── design.md                # Technical design and architecture
    ├── prd.json                 # Detailed list of tasks with status tracking and verification steps
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

### Backend Features (Spellbook Pattern)

Features in `apps/worker/src/features/` use the **Spellbook pattern** for Durable Objects:

```
feature-name/
├── FeatureName.ts      # ~10 lines: Spellbook.make() call
├── handlers.ts         # Pure Effect handler functions
├── helpers.ts          # Shared helper functions (optional)
└── drizzle/
    ├── drizzle.schema.ts   # Database schema
    └── migrations/         # SQL migrations (Drizzle-managed)
```

**Spellbook.make() Pattern:**
```typescript
// FeatureName.ts - minimal DO definition
import {FeatureRpcs} from "@kampus/feature-package";
import * as Spellbook from "../../shared/Spellbook";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";

export const FeatureName = Spellbook.make({
  rpcs: FeatureRpcs,
  handlers,
  migrations,
});
```

**Handler Pattern:**
```typescript
// handlers.ts - pure Effect functions with service dependencies
import {SqlClient} from "@effect/sql";
import {Effect} from "effect";

export const getItem = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [item] = yield* sql`SELECT * FROM items WHERE id = ${id}`;
    return item ?? null;
  });

export const handlers = {getItem, /* ... */};
```

**Conventions:**
- Handlers are pure Effect functions, no `this` keyword
- Use `SqlClient.SqlClient` service for database queries (template literals)
- Use `DurableObjectEnv`/`DurableObjectCtx` services to access DO context
- Drizzle handles migrations (Effect SQL's migrator doesn't work in vitest-pool-workers)
- Use `Schema.Struct()` not `Schema.Class()` (DOs can't return class instances)
- ID generation: `id("prefix")` from `@usirin/forge` (e.g., `id("story")`, `id("user")`)
- Export DO classes from `src/index.ts`, add bindings in `wrangler.jsonc`

**DO-to-DO Calls (Effect RPC):**
```typescript
// Use RPC client for cross-DO communication
import {makeWebPageParserClient} from "../web-page-parser/client";

const fetchMetadata = (url: string) =>
  Effect.gen(function* () {
    const env = yield* DurableObjectEnv;
    const parserId = env.WEB_PAGE_PARSER.idFromName(url);
    const client = makeWebPageParserClient(env.WEB_PAGE_PARSER.get(parserId));
    yield* client.init({url});
    return yield* client.getMetadata({});
  });
```

### Code Style

Uses **Biome** for formatting and linting:

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

## Finding Things

| What | Where |
| ------ | ------- |
| Feature specs | `specs/[feature-name]/` |
| Design tokens | `apps/kamp-us/src/design/phoenix.{ts,css}` |
| Spellbook factory | `apps/worker/src/shared/Spellbook.ts` |
| DO service tags | `apps/worker/src/services/DurableObjectServices.ts` |
| RPC definitions | `packages/library/src/rpc.ts`, `packages/web-page-parser/src/rpc.ts` |
| Domain errors | `packages/library/src/errors.ts` |
| RPC client (frontend) | `apps/kamp-us/src/rpc/client.ts` |
| RPC atoms | `apps/kamp-us/src/rpc/atoms.ts` |
| Feature implementations | `apps/worker/src/features/*/` |
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
| Local effect-atom source | `~/code/github.com/usirin/effect-atom/` |
