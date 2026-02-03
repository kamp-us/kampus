# Effect Patterns

## Services

**Context.Tag** - Interface separate from implementation (swappable, testable):
```typescript
class MyService extends Context.Tag("MyService")<MyService, {
  readonly doThing: () => Effect.Effect<void>
}>() {}

const MyServiceLive = Layer.succeed(MyService, {
  doThing: () => Effect.void
})
```

**Effect.Service** - App-level singleton where impl lives with tag.

## Layers

**Layer.effect** - Effectful creation, no cleanup needed:
```typescript
const MyServiceLive = Layer.effect(MyService, Effect.gen(function* () {
  const config = yield* Config
  return { doThing: () => Effect.void }
}))
```

**Layer.scoped** - When cleanup is needed (acquireRelease pattern):
```typescript
const MyServiceLive = Layer.scoped(MyService, Effect.gen(function* () {
  const resource = yield* Effect.acquireRelease(
    acquire,
    (r) => Effect.sync(() => r.close())
  )
  return { doThing: () => Effect.void }
}))
```

## Context: Global vs Per-Request

**Global context** - Provided via Layers at startup (SqlClient, services):
```typescript
const appLayer = Layer.mergeAll(SqlClientLive, MyServiceLive)
const runtime = ManagedRuntime.make(appLayer)
```

**Per-request context** - Use `Effect.provideService`, NOT Layer:
```typescript
// CORRECT
effect.pipe(Effect.provideService(CurrentUserId, userId))

// WRONG - don't use Layer for per-request data
Effect.provide(Layer.succeed(CurrentUserId, userId))
```

## Error Handling

### Errors vs Defects

- **Errors** = Expected failures (user not found, validation failed) → Handle them
- **Defects** = Bugs (null pointer, bad query) → Let them crash, fix the code

### Critical Rules

**Never silently swallow errors:**
```typescript
// WRONG - hides failures
effect.pipe(Effect.catchTag("SomeError", () => Effect.void))
effect.pipe(Effect.ignore)

// CORRECT - let error propagate or transform it
effect.pipe(Effect.mapError((e) => new MyError({ cause: e })))
```

**Never use catchAllCause** - it catches both errors AND defects:
```typescript
// WRONG - hides bugs
Effect.catchAllCause(effect, (cause) => Effect.fail(new MyError()))

// CORRECT - use mapError for expected errors only
Effect.mapError(effect, (error) => new MyError({ cause: error }))
```

**Never use global Error in error channel:**
```typescript
// WRONG
const bad: Effect.Effect<Result, Error> = Effect.fail(new Error("failed"))

// CORRECT - use Schema.TaggedError
class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String }
) {}
```

### SqlError in Durable Objects

In DO context with embedded SQLite, SqlError is usually a **defect** (bug in query):
- No connection issues (DB is always available)
- Query syntax errors = bug in code
- Let SqlError bubble up and crash - fix the code

```typescript
// DON'T catch SqlError just to re-die it
Effect.catchTag("SqlError", Effect.die)  // Redundant

// DO let it propagate naturally - it will become a defect
// If you need to handle specific constraint violations, catch those explicitly
```

### DO Storage Errors (KeyValueStore)

Use `PlatformError.SystemError` for storage API errors:
```typescript
Effect.tryPromise({
  try: () => storage.get(key),
  catch: (error) => PlatformError.SystemError({
    reason: "Unknown",
    module: "KeyValueStore",
    method: "get",
    description: String(error)
  })
})
```

This makes errors visible in the type system while using Effect's standard platform error type.

## Schema Patterns

**Schema.Class** for domain entities (automatic Equal/Hash):
```typescript
class Account extends Schema.Class<Account>("Account")({
  id: AccountId,
  name: Schema.NonEmptyTrimmedString,
}) {}
```

**Schema.TaggedError** for domain errors:
```typescript
class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  { userId: Schema.String }
) {}
```

**Always use effectful decode:**
```typescript
// WRONG - throws
Schema.decodeUnknownSync(Account)(data)

// CORRECT - returns Effect
yield* Schema.decodeUnknown(Account)(data)
```

## ManagedRuntime in Durable Objects

**Disposal:** ManagedRuntime requires explicit `dispose()` to run finalizers:
```typescript
await runtime.dispose()  // runs Scope.close() → all finalizers
```

**DO Limitation:** Cloudflare DOs have no lifecycle hook for hibernation/eviction. No `onBeforeHibernate()` or destructor.

**Practical guidance for Spellbook:**
- Our layers (SqliteClient, KeyValueStore, DO context) don't have real finalizers
- SqliteClient wraps `ctx.storage.sql` - no external connection to close
- So: currently safe to not dispose, but document this assumption
- If adding layers with real resources (external connections), disposal becomes critical

## SQL Patterns

**Never use type parameters on sql queries:**
```typescript
// WRONG
const rows = yield* sql<{ count: string }>`SELECT COUNT(*)`

// CORRECT - use SqlSchema with Schema validation
const findById = SqlSchema.findOne({
  Request: AccountId,
  Result: AccountRow,
  execute: (id) => sql`SELECT * FROM accounts WHERE id = ${id}`
})
```

**SqlSchema helpers:**
- `findOne` → returns `Option` (0 or 1 result)
- `findAll` → returns `Array` (0+ results)
- `single` → exactly 1 result (fails otherwise)
- `void` → INSERT/UPDATE/DELETE with no return
