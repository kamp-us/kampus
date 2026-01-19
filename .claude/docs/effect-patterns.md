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

## Error Handling

Use `Schema.TaggedError` from `@kampus/library` for RPC-serializable errors:
```typescript
import {Schema} from "effect"

class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  userId: Schema.String
}) {}
```
