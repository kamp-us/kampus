# Spellbook: Instructions

## Feature Overview

Refactor Durable Object infrastructure to be Effect-native. Use `@effect/sql` for queries (keeping Drizzle for migrations), extract handlers as pure Effect functions, and introduce `Spellbook.make()` pattern to eliminate boilerplate.

### Why

Current Library.ts is ~600 lines with:
- Verbose fetch() boilerplate
- Inconsistent handler patterns (Effect.promise vs Effect.gen)
- Awkward `this` binding in Effect.gen
- No service abstraction for db/env/ctx
- Repeated setup in every DO

Goal: DO class becomes ~10 lines, handlers are testable pure functions. Both DOs use same `Spellbook.make()` + Effect RPC pattern.

## User Stories

**As a developer**, I want:

1. **Pure function handlers** - Write handlers without `this`, test with mock layers
2. **Minimal DO boilerplate** - DO class is just wiring, ~10 lines
3. **Effect-native SQL queries** - Use `@effect/sql` template literals for queries
4. **Two-tier testing** - Fast unit tests with mocks + integration tests with real DOs
5. **Consistent patterns** - One way to build DOs across all features

## Acceptance Criteria

- [x] `Spellbook.make()` works for Library DO
- [ ] `Spellbook.make()` works for WebPageParser DO (same pattern)
- [ ] WebPageParser converted from DO-RPC to Effect RPC
- [ ] New `@kampus/web-page-parser` package with RPC definitions
- [x] All handlers extracted as pure Effect functions (no `this`)
- [x] Queries use `@effect/sql` SqlClient (migrations stay Drizzle)
- [x] Existing integration tests still pass
- [ ] New unit tests for handlers using mock SqlClient
- [x] Library.ts reduced to ~10 lines
- [ ] WebPageParser.ts reduced significantly
- [x] Type check passes
- [ ] Manual test: library + fetch-title features work in UI

## Constraints

- **Must use existing migrations schema** - Don't change table structure, just migration format
- **Keep integration tests** - Don't remove existing vitest-pool-workers tests
- **No external deps** - Only Effect ecosystem packages

## Dependencies

- `@effect/sql` - Core SQL abstraction
- `@effect/sql-sqlite-do` - Cloudflare DO SqlStorage wrapper (includes Reactivity internally)
- `drizzle-orm` - Migrations only (SqliteMigrator doesn't work in vitest-pool-workers)
- Existing `@effect/rpc` setup

## Out of Scope

- Changing LibraryRpcs contract (stays same)
- UI changes
- New features (this is infra refactor only)

## Notes

**WebPageParser API change:** Converting to Effect RPC means callers need updates:
- `apps/worker/src/graphql/schema.ts` - GraphQL resolver
- `apps/worker/src/features/library/Library.ts` - DO-to-DO call

**New package:** `@kampus/web-page-parser` (or similar) for `WebPageParserRpcs` - each DO feature owns its RPC definitions.
