# Spellbook: Requirements

Derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR1: Spellbook Module

| ID | Requirement |
|----|-------------|
| FR1.1 | `Spellbook.make()` accepts RPC definitions, handlers, and migrations config |
| FR1.2 | `Spellbook.make()` returns a DurableObject class |
| FR1.3 | Returned class handles RPC requests via `fetch()` using Effect RPC |
| FR1.4 | Returned class runs migrations on construction via `blockConcurrencyWhile()` |
| FR1.5 | Handlers receive `SqlClient.SqlClient` service for database access |
| FR1.6 | Handlers receive `DurableObjectEnv` and `DurableObjectCtx` services |

### FR2: Library DO Migration

| ID | Requirement |
|----|-------------|
| FR2.1 | Library DO uses `Spellbook.make()` pattern |
| FR2.2 | All Library handlers extracted as pure Effect functions |
| FR2.3 | Handlers depend on services, not `this` |
| FR2.4 | Queries use `@effect/sql` SqlClient, migrations stay Drizzle |
| FR2.5 | Same database schema preserved (table structure unchanged) |
| FR2.6 | LibraryRpcs contract unchanged |

### FR3: WebPageParser DO Migration

| ID | Requirement |
|----|-------------|
| FR3.1 | WebPageParser DO uses `Spellbook.make()` pattern |
| FR3.2 | WebPageParser converted from DO-RPC to Effect RPC |
| FR3.3 | New `@kampus/web-page-parser` package created |
| FR3.4 | Package exports `WebPageParserRpcs` definitions |
| FR3.5 | Callers updated to use Effect RPC client |
| FR3.6 | Same database schema preserved |

### FR4: Caller Updates

| ID | Requirement |
|----|-------------|
| FR4.1 | `apps/worker/src/graphql/schema.ts` updated for WebPageParser RPC |
| FR4.2 | `apps/worker/src/features/library/Library.ts` DO-to-DO call updated |

## Non-Functional Requirements

### NFR1: Code Quality

| ID | Requirement |
|----|-------------|
| NFR1.1 | Library.ts reduced from ~600 lines to ~5 lines |
| NFR1.2 | WebPageParser.ts reduced from ~78 lines to ~5 lines |
| NFR1.3 | Handlers testable without DO instantiation |
| NFR1.4 | Consistent pattern across all DOs |

### NFR2: Testing

| ID | Requirement |
|----|-------------|
| NFR2.1 | Unit tests for handlers using mock `SqlClient` layer |
| NFR2.2 | Existing integration tests continue to pass |
| NFR2.3 | Two-tier testing: unit (fast, mocked) + integration (real DO) |

### NFR3: Compatibility

| ID | Requirement |
|----|-------------|
| NFR3.1 | Type check passes (`tsc --noEmit`) |
| NFR3.2 | All existing tests pass |
| NFR3.3 | UI functionality unchanged (library + fetch-title) |

## Technical Requirements

### TR1: Dependencies

| ID | Requirement |
|----|-------------|
| TR1.1 | Add `@effect/sql` to worker package |
| TR1.2 | Add `@effect/sql-sqlite-do` to worker package |
| TR1.3 | Keep Drizzle deps for migrations (drizzle-orm, drizzle-kit) |

### TR2: Package Structure

| ID | Requirement |
|----|-------------|
| TR2.1 | Spellbook module in `apps/worker/src/shared/Spellbook.ts` |
| TR2.2 | Service tags in `apps/worker/src/shared/services.ts` |
| TR2.3 | New package `packages/web-page-parser/` for WebPageParser RPC |

### TR3: Module Structure (per DO)

| ID | Requirement |
|----|-------------|
| TR3.1 | `handlers.ts` - Pure Effect functions |
| TR3.2 | `helpers.ts` - Shared helper functions (optional) |
| TR3.3 | `drizzle/` - Schema and migrations (Drizzle-managed) |
| TR3.4 | `[DoName].ts` - Minimal `Spellbook.make()` call |

## Acceptance Matrix

| Requirement | Verification Method |
|-------------|---------------------|
| FR1.* | Type check + unit tests |
| FR2.* | Integration tests + manual UI test |
| FR3.* | Integration tests + manual UI test |
| FR4.* | Integration tests |
| NFR1.* | Code review (line counts) |
| NFR2.* | Test suite passes |
| NFR3.* | CI pipeline + manual test |
| TR1.* | `pnpm install` succeeds |
| TR2.* | File structure verification |
| TR3.* | File structure verification |
