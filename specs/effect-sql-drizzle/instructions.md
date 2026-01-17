# Instructions: @effect/sql-drizzle Migration

## Context

GitHub Issue: https://github.com/kamp-us/kampus/issues/20

Current @effect/sql Model.Class pattern creates duplication:
- drizzle.schema.ts defines tables for migrations
- models.ts duplicates same fields for Effect repositories
- ~160 lines of ceremony for 2 entities

## Goal

Replace Model.Class with @effect/sql-drizzle:
- Single source of truth: Drizzle schema
- Drizzle queries yieldable as Effects
- Full query builder for joins, pagination, aggregations

## User Stories

1. As a developer, I want one schema definition so I don't maintain duplicates
2. As a developer, I want typed Drizzle queries so I get autocomplete for table/column names
3. As a developer, I want to use Drizzle's query builder so I avoid raw SQL string interpolation

## Acceptance Criteria

- [ ] @effect/sql-drizzle added to worker
- [ ] Spellbook.make accepts schema param, provides SqliteDrizzle service
- [ ] models.ts deleted
- [ ] All handlers use Drizzle query builder
- [ ] No raw sql`` template literals remain
- [ ] All tests pass
- [ ] Typecheck passes
