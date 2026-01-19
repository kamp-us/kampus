# Gotchas

## Effect

- **Effect.promise swallows error types** - Use `Effect.gen` + `Effect.fail` for typed RPC errors
- **Import errors from shared package** - Use `Schema.TaggedError` from `@kampus/library`

## RPC

- **401 in RPC client** - Add `HttpClient.transformResponse` to convert HTTP 401 to typed `UnauthorizedError`

## Frontend

- **Design system className** - Props intentionally omit it; don't add custom styles
- **Result.builder vs Result.match** - `onSuccess` in `Result.match` gets `Success<T>` wrapper; `Result.builder` unwraps to `T`

## Dev Environment

- **Don't run `turbo dev` automatically** - User starts dev servers manually
- **Drizzle migrations** - Effect SQL's migrator doesn't work in vitest-pool-workers
