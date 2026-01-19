# worker

Backend API using Cloudflare Workers + Durable Objects with Effect RPC.

## Spellbook Pattern

Features in `src/features/` use this structure:

```
feature-name/
├── FeatureName.ts      # ~10 lines: Spellbook.make() call
├── handlers.ts         # Pure Effect handler functions
├── helpers.ts          # Optional shared helpers
└── drizzle/
    ├── drizzle.schema.ts
    └── migrations/
```

### DO Definition

```typescript
import {FeatureRpcs} from "@kampus/feature-package"
import * as Spellbook from "../../shared/Spellbook"
import migrations from "./drizzle/migrations/migrations"
import {handlers} from "./handlers"

export const FeatureName = Spellbook.make({
  rpcs: FeatureRpcs,
  handlers,
  migrations,
})
```

### Handlers

```typescript
import {SqlClient} from "@effect/sql"
import {Effect} from "effect"

export const getItem = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [item] = yield* sql`SELECT * FROM items WHERE id = ${id}`
    return item ?? null
  })

export const handlers = {getItem}
```

## Conventions

- Handlers are pure Effect functions, no `this`
- `SqlClient.SqlClient` for DB queries (template literals)
- `DurableObjectEnv`/`DurableObjectCtx` for DO context
- `id("prefix")` from `@usirin/forge` for ID generation
- Export DO classes from `src/index.ts`
- Add bindings in `wrangler.jsonc`

## DO-to-DO Calls

```typescript
import {makeWebPageParserClient} from "../web-page-parser/client"

const fetchMetadata = (url: string) =>
  Effect.gen(function* () {
    const env = yield* DurableObjectEnv
    const parserId = env.WEB_PAGE_PARSER.idFromName(url)
    const client = makeWebPageParserClient(env.WEB_PAGE_PARSER.get(parserId))
    yield* client.init({url})
    return yield* client.getMetadata({})
  })
```

## Durable Objects Essentials

- Single-threaded execution per instance
- Own SQLite database, no shared memory
- Use `idFromName()` for routing
- Always await RPC calls
- Initialize with `blockConcurrencyWhile()` for migrations

See [Cloudflare DO docs](https://developers.cloudflare.com/durable-objects/) for advanced patterns.
