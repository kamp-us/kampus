# Requirements: @effect/sql-drizzle Migration

## Functional Requirements

### FR-1: Dependency
- Add @effect/sql-drizzle package to worker

### FR-2: Spellbook Integration
- MakeConfig accepts `schema` parameter
- Provide typed SqliteDrizzle service to handlers
- SqliteDrizzle layer depends on SqlClient (already provided)

### FR-3: Handler Migration
- Replace StoryRepo/TagRepo usage with Drizzle queries
- Replace raw sql`` templates with Drizzle query builder
- Remove Model.Class and Effect.Service repo definitions

### FR-4: Query Patterns
| Pattern | Drizzle API |
|---------|-------------|
| Find by ID | `db.select().from(table).where(eq(table.id, id))` |
| Count | `db.select({ count: count() }).from(table)` |
| IN clause | `db.select().from(table).where(inArray(table.id, ids))` |
| Pagination | `.orderBy(desc(table.id)).limit(n).offset(m)` |
| Joins | `.leftJoin(other, eq(table.fk, other.id))` |
| Insert | `db.insert(table).values({...}).returning()` |
| Update | `db.update(table).set({...}).where(eq(...))` |
| Delete | `db.delete(table).where(eq(...))` |

## Non-Functional Requirements

### NFR-1: No Breaking Changes
- All existing tests must pass
- RPC API unchanged

### NFR-2: Type Safety
- Drizzle instance must be typed with feature schema
- No `any` casts in handlers

### NFR-3: Scope
- Library feature: full migration
- web-page-parser: full migration
