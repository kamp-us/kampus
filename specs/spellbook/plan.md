# Spellbook: Implementation Plan

Derived from [design.md](./design.md).

## Overview

| Phase | Goal | Files |
|-------|------|-------|
| 1 | Infrastructure Setup | 3 new |
| 2 | Library DO Migration | 4 new, 1 refactor |
| 3 | WebPageParser Package + Migration | 6 new, 3 modify |
| 4 | Unit Tests | 2 new |
| 5 | Cleanup | 1 remove, 1 update |

---

## Phase 1: Infrastructure Setup

**Goal:** Create Spellbook module and service tags.

### Files

| File | Action |
|------|--------|
| `apps/worker/package.json` | Add deps |
| `apps/worker/src/shared/Spellbook.ts` | New |
| `apps/worker/src/shared/services.ts` | New |

### Steps

1. Add dependencies:
   ```bash
   pnpm --filter worker add @effect/sql @effect/sql-sqlite-do
   ```

2. Create `apps/worker/src/shared/services.ts`:
   ```typescript
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

3. Create `apps/worker/src/shared/Spellbook.ts` with `make()` function (see design.md)

### Verification

```bash
turbo run typecheck
```

---

## Phase 2: Library DO Migration

**Goal:** Convert Library.ts to Spellbook pattern with pure function handlers, keeping Drizzle for migrations.

### Files

| File | Action |
|------|--------|
| `apps/worker/src/features/library/helpers.ts` | New |
| `apps/worker/src/features/library/handlers.ts` | New |
| `apps/worker/src/features/library/Library.ts` | Refactor (~600 → ~10 lines) |
| `apps/worker/src/features/library/drizzle/` | Keep (migrations) |

### Steps

1. Create `helpers.ts` - Extract shared helpers:
   ```typescript
   export const getTagsForStories = (storyIds: string[]) =>
     Effect.gen(function* () {
       const sql = yield* SqlClient.SqlClient;
       // ... query and map tags
     });
   ```

2. Create `handlers.ts` - Extract all handlers as pure functions:
   - `getStory`, `listStories`, `listStoriesByTag`
   - `createStory`, `updateStory`, `deleteStory`
   - `listTags`, `createTag`, `updateTag`, `deleteTag`
   - `getTagsForStory`, `setStoryTags`
   - `fetchUrlMetadata`

3. Refactor `Library.ts`:
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

### Verification

```bash
turbo run typecheck
turbo run test
# Manual test: library feature in UI
```

---

## Phase 3: WebPageParser Package + Migration

**Goal:** Create new package, convert WebPageParser to Effect RPC.

### Part A: Create Package

| File | Action |
|------|--------|
| `packages/web-page-parser/package.json` | New |
| `packages/web-page-parser/tsconfig.json` | New |
| `packages/web-page-parser/src/index.ts` | New |
| `packages/web-page-parser/src/rpc.ts` | New |
| `packages/web-page-parser/src/schema.ts` | New |

#### Steps

1. Create package structure:
   ```bash
   mkdir -p packages/web-page-parser/src
   ```

2. Create `package.json`:
   ```json
   {
     "name": "@kampus/web-page-parser",
     "version": "0.0.1",
     "type": "module",
     "exports": {
       ".": "./src/index.ts"
     },
     "dependencies": {
       "@effect/rpc": "catalog:",
       "effect": "catalog:"
     }
   }
   ```

3. Create `rpc.ts` with `WebPageParserRpcs`:
   ```typescript
   import {Rpc, RpcGroup} from "@effect/rpc";
   import {Schema} from "effect";
   import {PageMetadata} from "./schema";

   export const WebPageParserRpcs = RpcGroup.make(
     Rpc.make("init", {
       payload: {url: Schema.String},
       success: Schema.Void,
     }),
     Rpc.make("getMetadata", {
       payload: {forceFetch: Schema.optional(Schema.Boolean)},
       success: Schema.NullOr(PageMetadata),
     }),
   );
   ```

4. Create `schema.ts` - Move `PageMetadata` from worker

5. Create `index.ts` - Re-exports

6. Add to `pnpm-workspace.yaml` if needed

### Part B: Migrate WebPageParser DO

| File | Action |
|------|--------|
| `apps/worker/src/features/web-page-parser/handlers.ts` | New |
| `apps/worker/src/features/web-page-parser/WebPageParser.ts` | Refactor |
| `apps/worker/src/features/web-page-parser/drizzle/` | Keep (migrations) |
| `apps/worker/package.json` | Add @kampus/web-page-parser |

#### Steps

1. Add package dependency:
   ```bash
   pnpm --filter worker add @kampus/web-page-parser@workspace:*
   ```

2. Create `handlers.ts`:
   ```typescript
   export const init = ({url}: {url: string}) =>
     Effect.gen(function* () {
       const ctx = yield* DurableObjectCtx;
       yield* Effect.promise(() => ctx.storage.put("url", url));
     });

   export const getMetadata = ({forceFetch}: {forceFetch?: boolean}) =>
     Effect.gen(function* () {
       // ... fetch/cache logic
     });
   ```

3. Refactor `WebPageParser.ts`:
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

### Part C: Update Callers

| File | Action |
|------|--------|
| `apps/worker/src/graphql/schema.ts` | Update WebPageParser call |
| `apps/worker/src/features/library/handlers.ts` | Update DO-to-DO call |

#### Steps

1. Update GraphQL resolver to use Effect RPC client
2. Update Library's `fetchUrlMetadata` handler to use RPC client

### Verification

```bash
pnpm install
turbo run typecheck
turbo run test
# Manual test: fetch-title feature in UI
```

---

## Phase 4: Unit Tests

**Goal:** Add unit tests for handlers using mock SqlClient.

### Files

| File | Action |
|------|--------|
| `apps/worker/test/library-handlers.spec.ts` | New |
| `apps/worker/test/web-page-parser-handlers.spec.ts` | New |

### Steps

1. Create mock SqlClient helper:
   ```typescript
   const createMockSql = (responses: Map<string, unknown[]>) =>
     Layer.succeed(SqlClient.SqlClient, {
       // ... mock implementation
     } as any);
   ```

2. Write Library handler tests:
   - `getStory` returns null when not found
   - `getStory` returns story with tags
   - `createStory` validates URL
   - Error cases

3. Write WebPageParser handler tests:
   - `getMetadata` returns cached result
   - `getMetadata` fetches when cache expired

### Verification

```bash
turbo run test
```

---

## Phase 5: Cleanup & Documentation

**Goal:** Update documentation with Spellbook patterns.

### Files

| File | Action |
|------|--------|
| `CLAUDE.md` | Update patterns |

### Steps

1. Update CLAUDE.md:
   - Add Spellbook pattern documentation
   - Update "Backend Features" section
   - Document hybrid approach: Drizzle migrations + Effect SQL queries

### Verification

```bash
turbo run typecheck
turbo run test
# Full manual test of library + fetch-title features
```

---

## Progress Tracking

### Phase 1: Infrastructure
- [x] Add @effect/sql, @effect/sql-sqlite-do deps
- [x] Create services.ts (DurableObjectEnv, DurableObjectCtx)
- [x] Create Spellbook.ts
- [x] Type check passes

### Phase 2: Library Migration
- [x] Create helpers.ts
- [x] Create handlers.ts
- [x] Refactor Library.ts (~10 lines)
- [x] Integration tests pass
- [ ] Manual UI test passes

### Phase 3: WebPageParser
- [ ] Create @kampus/web-page-parser package
- [ ] Create rpc.ts, schema.ts
- [ ] Create handlers.ts
- [ ] Refactor WebPageParser.ts
- [ ] Update GraphQL caller
- [ ] Update Library caller
- [ ] Integration tests pass
- [ ] Manual UI test passes

### Phase 4: Unit Tests
- [ ] Create mock SqlClient helper
- [ ] Library handler tests
- [ ] WebPageParser handler tests
- [ ] All tests pass

### Phase 5: Cleanup & Documentation
- [ ] Update CLAUDE.md with Spellbook patterns
- [ ] Final verification

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Migration data loss | Same schema, just different migration format |
| Integration test failures | Run tests after each phase |
| RPC client typing issues | Verify against Effect source before implementing |
| DO-to-DO call complexity | Create helper if needed, document pattern |
