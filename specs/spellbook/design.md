# Spellbook: Technical Design

Derived from [requirements.md](./requirements.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Spellbook.make()                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  RPC Defs     │  │  Handlers     │  │  Migrations       │   │
│  │  (LibraryRpcs)│  │  (pure fns)   │  │  (Drizzle)        │   │
│  └───────┬───────┘  └───────┬───────┘  └─────────┬─────────┘   │
│          │                  │                    │              │
│          └──────────────────┼────────────────────┘              │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DurableObject Class (returned)              │   │
│  │  - ManagedRuntime with all layers                        │   │
│  │  - fetch() → RpcServer.toHttpApp()                       │   │
│  │  - Migrations run in constructor                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Handlers are pure Effect functions** - No class, no `this`, just functions depending on services
2. **DO class is pure infrastructure** - Just wires layers together, ~5 lines
3. **`Spellbook.make()` over inheritance** - Returns a class, no base class needed
4. **Testable by design** - Handlers tested via mock layers, no DO instantiation needed

---

## Spellbook Module

### API Design

```typescript
// apps/worker/src/shared/Spellbook.ts
import * as Spellbook from "./Spellbook"
import migrations from "./drizzle/migrations/migrations"

// Returns a DurableObject class
Spellbook.make<TEnv, Rpcs>({
  rpcs: Rpcs,                    // RPC group definitions
  handlers: Rpc.ToHandler<Rpcs>, // Handler implementations
  migrations,                    // Drizzle migrations bundle
})
```

### Implementation

```typescript
import {DurableObject} from "cloudflare:workers";
import {SqliteClient} from "@effect/sql-sqlite-do";
import {HttpServerRequest, HttpServerResponse} from "@effect/platform";
import {RpcSerialization, RpcServer} from "@effect/rpc";
import {Effect, Layer, ManagedRuntime} from "effect";
import {drizzle} from "drizzle-orm/durable-sqlite";
import {migrate} from "drizzle-orm/durable-sqlite/migrator";
import {DurableObjectEnv, DurableObjectCtx} from "./services";

// Drizzle migrations bundle type
interface DrizzleMigrations {
  journal: {entries: Array<{idx: number; when: number; tag: string; breakpoints: boolean}>};
  migrations: Record<string, string>;
}

export const make = <R extends Rpc.Any, TEnv extends Env = Env>(
  config: {
    rpcs: RpcGroup.RpcGroup<R>;
    handlers: RpcGroup.HandlersFrom<R>;
    migrations: DrizzleMigrations;
  }
) => {
  return class extends DurableObject<TEnv> {
    private runtime: ManagedRuntime.ManagedRuntime<any, any>;

    constructor(ctx: DurableObjectState, env: TEnv) {
      super(ctx, env);

      // SQLite client layer with Reactivity included
      const sqliteLayer = SqliteClient.layer({db: ctx.storage.sql});

      const doLayer = Layer.mergeAll(
        Layer.succeed(DurableObjectEnv, env),
        Layer.succeed(DurableObjectCtx, ctx),
      );

      const handlerLayer = Layer.mergeAll(
        config.rpcs.toLayer(config.handlers),
        RpcSerialization.layerJson,
        Layer.scope,
      );

      const fullLayer = Layer.provideMerge(
        handlerLayer,
        Layer.mergeAll(doLayer, sqliteLayer)
      );

      this.runtime = ManagedRuntime.make(fullLayer);

      // Run Drizzle migrations before any requests
      this.ctx.blockConcurrencyWhile(async () => {
        const db = drizzle(ctx.storage);
        migrate(db, config.migrations);
      });
    }

    async fetch(request: Request): Promise<Response> {
      return this.runtime.runPromise(
        Effect.gen(function* () {
          const httpApp = yield* RpcServer.toHttpApp(config.rpcs);
          const response = yield* httpApp.pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(request),
            ),
          );
          return HttpServerResponse.toWeb(response);
        })
      );
    }
  };
};
```

**Why Drizzle for migrations:** Effect SQL's `SqliteMigrator` uses `withTransaction()` internally which doesn't work in `vitest-pool-workers` test environment. Drizzle migrations work correctly in both dev and test.

### Service Tags

```typescript
// apps/worker/src/shared/services.ts
import {Context} from "effect";

export class DurableObjectEnv extends Context.Tag("DO/Env")<
  DurableObjectEnv,
  Env
>() {}

export class DurableObjectCtx extends Context.Tag("DO/Ctx")<
  DurableObjectCtx,
  DurableObjectState
>() {}
```

---

## @effect/sql-sqlite-do Usage

### Query Pattern

```typescript
import {SqlClient} from "@effect/sql";
import {Effect} from "effect";

// Template literal queries - returns Effect
const getStory = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql`SELECT * FROM story WHERE id = ${id}`;
    return rows[0] ?? null;
  });

// Insert with RETURNING
const createStory = (url: string, title: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [story] = yield* sql`
      INSERT INTO story (id, url, title, created_at)
      VALUES (${id("story")}, ${url}, ${title}, ${Date.now()})
      RETURNING *
    `;
    return story;
  });

// Transactions
const atomicOperation = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DELETE FROM story_tag WHERE story_id = ${id}`;
        yield* sql`INSERT INTO story_tag ...`;
      })
    );
  });
```

### Migration Pattern

Migrations use Drizzle's migration system. Generate migrations with drizzle-kit:

```bash
pnpm --filter worker exec drizzle-kit generate
```

Import the generated migrations bundle in your DO:

```typescript
// Library.ts
import migrations from "./drizzle/migrations/migrations";

export const Library = Spellbook.make({
  rpcs: LibraryRpcs,
  handlers,
  migrations,  // Drizzle migrations bundle
});
```

Drizzle migrations are stored in `drizzle/migrations/` with SQL files and a `migrations.js` bundle.

---

## Module Structure

```
apps/worker/src/
├── shared/
│   ├── Spellbook.ts              # Spellbook.make() factory
│   └── services.ts               # DurableObjectEnv, DurableObjectCtx tags (via services/index.ts)
│
├── features/
│   ├── library/
│   │   ├── index.ts              # Re-exports Library class
│   │   ├── Library.ts            # ~10 lines: Spellbook.make({...})
│   │   ├── handlers.ts           # Pure Effect handler functions
│   │   ├── helpers.ts            # Shared helpers (getTagsForStories)
│   │   └── drizzle/
│   │       ├── drizzle.schema.ts # Database schema
│   │       └── migrations/       # Drizzle migrations (SQL + bundle)
│   │
│   └── web-page-parser/
│       ├── index.ts              # Re-exports WebPageParser class
│       ├── WebPageParser.ts      # ~10 lines: Spellbook.make({...})
│       ├── handlers.ts           # Pure Effect handler functions
│       └── drizzle/
│           ├── drizzle.schema.ts # Database schema
│           └── migrations/       # Drizzle migrations (SQL + bundle)

packages/
└── web-page-parser/
    ├── package.json
    ├── src/
    │   ├── index.ts              # Re-exports
    │   ├── rpc.ts                # WebPageParserRpcs definition
    │   └── schema.ts             # PageMetadata schema
    └── tsconfig.json
```

---

## Library DO Design

### Final Library.ts (~10 lines)

```typescript
import {LibraryRpcs} from "@kampus/library";
import * as Spellbook from "../../shared/Spellbook";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";

export const Library = Spellbook.make({
  rpcs: LibraryRpcs,
  handlers,
  migrations,
});
```

### Handler Example

```typescript
// handlers.ts
import {SqlClient} from "@effect/sql";
import {Effect} from "effect";
import {getTagsForStories} from "./helpers";

export const getStory = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [story] = yield* sql`SELECT * FROM story WHERE id = ${id}`;
    if (!story) return null;

    const tagsByStory = yield* getTagsForStories([id]);
    return {...story, tags: tagsByStory.get(id) ?? []};
  });

export const createStory = ({url, title}: {url: string; title?: string}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Validate URL
    const parsedUrl = yield* Effect.try({
      try: () => new URL(url),
      catch: () => new InvalidUrlError({url}),
    });

    const [story] = yield* sql`
      INSERT INTO story (id, url, title, created_at)
      VALUES (${id("story")}, ${parsedUrl.href}, ${title ?? null}, ${Date.now()})
      RETURNING *
    `;

    return story;
  });

// ... other handlers
```

---

## WebPageParser DO Design

### New Package: @kampus/web-page-parser

```typescript
// packages/web-page-parser/src/rpc.ts
import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {PageMetadata} from "./schema";

export const WebPageParserRpcs = RpcGroup.make(
  Rpc.make("init", {
    input: Schema.Struct({url: Schema.String}),
    output: Schema.Void,
  }),
  Rpc.make("getMetadata", {
    input: Schema.Struct({forceFetch: Schema.optional(Schema.Boolean)}),
    output: PageMetadata,
  }),
);
```

### Final WebPageParser.ts (~10 lines)

```typescript
import {WebPageParserRpcs} from "@kampus/web-page-parser";
import * as Spellbook from "../../shared/Spellbook";
import migrations from "./drizzle/migrations/migrations";
import {handlers} from "./handlers";

export const WebPageParser = Spellbook.make({
  rpcs: WebPageParserRpcs,
  handlers,
  migrations,
});
```

### Caller Updates

```typescript
// Before (DO-RPC)
const parser = env.WEB_PAGE_PARSER.get(parserId);
await parser.init(url);
const metadata = await parser.getMetadata();

// After (Effect RPC)
const parser = env.WEB_PAGE_PARSER.get(parserId);
const client = RpcClient.make(WebPageParserRpcs, {
  fetch: (req) => parser.fetch(req),
});
yield* client.init({url});
const metadata = yield* client.getMetadata({});
```

---

## Testing Strategy

### Two-Tier Approach

| Level | What | How | Speed |
|-------|------|-----|-------|
| Unit | Handler logic | Mock `SqlClient` layer | Fast |
| Integration | Full DO behavior | `vitest-pool-workers` | Slow |

### Unit Test Pattern

```typescript
// apps/worker/test/library-handlers.spec.ts
import {Effect, Layer} from "effect";
import {SqlClient} from "@effect/sql";
import {getStory} from "../src/features/library/handlers";
import {describe, it, expect} from "vitest";

const createMockSql = (responses: Map<string, unknown[]>) =>
  Layer.succeed(SqlClient.SqlClient, {
    // Mock template literal function
  } as any);

describe("Library Handlers", () => {
  it("getStory returns null when not found", async () => {
    const mockLayer = createMockSql(new Map([
      ["SELECT * FROM story WHERE id = ?", []],
    ]));

    const result = await Effect.runPromise(
      getStory({id: "story_123"}).pipe(Effect.provide(mockLayer))
    );

    expect(result).toBeNull();
  });
});
```

### Integration Test Pattern (existing)

```typescript
// apps/worker/test/library.spec.ts
import {env} from "cloudflare:test";

describe("Library Integration", () => {
  it("creates and retrieves story", async () => {
    const library = env.LIBRARY.get(env.LIBRARY.idFromName("test-user"));
    // ... test via RPC client
  });
});
```

---

## Layer Composition

```
┌─────────────────────────────────────────────────────┐
│                   ManagedRuntime                     │
├─────────────────────────────────────────────────────┤
│  handlerLayer                                        │
│  ├── rpcs.toLayer(handlers)  ← RPC handler layer    │
│  ├── RpcSerialization.layerJson                     │
│  └── Layer.scope                                     │
├─────────────────────────────────────────────────────┤
│  provided by:                                        │
│  ├── doLayer                                         │
│  │   ├── DurableObjectEnv (env)                     │
│  │   └── DurableObjectCtx (ctx)                     │
│  └── sqliteLayer                                     │
│      ├── SqlClient.SqlClient                         │
│      └── Reactivity (internal)                       │
└─────────────────────────────────────────────────────┘
```

---

## Trade-offs

### Hybrid Approach: Drizzle Migrations + Effect SQL Queries

| Aspect | Tool | Why |
|--------|------|-----|
| Migrations | Drizzle | Works in vitest-pool-workers (Effect's SqliteMigrator uses withTransaction which fails in tests) |
| Queries | @effect/sql | Effect-native composition, proper Error typing, SqlClient template literals |
| Schema | Drizzle | Type-safe schema DSL, drizzle-kit for migration generation |

**Trade-off:** Two ORM tools in stack, but each used for its strength. Migrations are write-once, queries are the frequent operation that benefits from Effect integration.

---

## Open Questions

1. **RPC client helper for DO-to-DO calls?** - Should we create a helper for internal DO calls?
2. **Error schema alignment?** - Ensure handler errors match RPC error schemas
