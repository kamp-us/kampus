# Replace @effect/sql Model.Class with @effect/sql-drizzle

## Problem Statement

Current Library feature had duplicated schema definitions:

1. **drizzle.schema.ts** - Drizzle schema for migrations, indexes, FK constraints
2. **Raw SQL queries** - SQL template literals with manual type annotations

This created:
- Manual SQL query construction prone to errors
- Lack of type safety for query results
- Inconsistent query patterns across handlers
- Verbose row type definitions that duplicate schema info

## Solution

Replace raw SQL template literals with `@effect/sql-drizzle`:
- Single source of truth: Drizzle schema
- Drizzle queries are yieldable Effects (patched QueryPromise)
- Type-safe query builder with auto-completion
- Full Drizzle query builder for joins, pagination, aggregations

## Acceptance Criteria

- [x] `@effect/sql-drizzle` added as dependency
- [x] All Library handlers use Drizzle query builder (no raw `sql\`\`` templates)
- [x] All WebPageParser handlers use Drizzle query builder
- [x] Type checking passes
- [x] Integration tests pass (library-stories.spec.ts, library-tags.spec.ts: 34/34 tests passing)
- [ ] Unit tests updated to work with Drizzle (currently failing due to SqlClient mocking approach)

## Implementation Notes

The unit tests in `library-handlers.spec.ts` and `web-page-parser-handlers.spec.ts` need to be updated to mock Drizzle queries instead of SqlClient. The integration tests that use actual Durable Objects pass successfully, demonstrating that the migration works correctly in production-like conditions.
