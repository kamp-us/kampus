# GraphQL + Relay Data Layer

## Feature Overview

Replace effect-atom + Effect RPC frontend data fetching with GraphQL + Relay. Keep Spellbook DOs as the data layer, add GraphQL resolvers that call DOs via Spellcaster (RPC client factory), use Effect RequestResolver for batching.

**Why:**
- Overfetching with current approach - components fetch full entities
- Manual cache invalidation via `reactivityKeys` is error-prone
- No normalized cache - same entity fetched multiple times = separate copies
- Tight coupling - components know RPC structure instead of just data needs
- No automatic batching - N+1 queries on nested fields

**Architecture:**
```
Browser ──Relay──► Worker ──► GraphQL Resolvers
                                    │
                               Effect Request + RequestResolver (batching)
                                    │
                               Spellcaster (RPC client factory)
                                    │
                               Spellbook DO (SQLite)
```

## User Stories

1. **As a frontend developer**, I want to colocate data requirements with components using Relay fragments, so I don't overfetch or underfetch.

2. **As a frontend developer**, I want mutations to automatically update the normalized cache, so I don't manually specify `reactivityKeys`.

3. **As a backend developer**, I want a single GraphQL schema as the API contract, so frontend and backend can evolve independently.

4. **As a user**, I want faster page loads through automatic batching and caching, so the app feels responsive.

## Acceptance Criteria

### Backend
- [ ] Relay connection types: `PageInfo`, `StoryEdge`, `StoryConnection`
- [ ] `toConnection()` helper to transform RPC response → Relay format
- [ ] Batch RPCs: `getBatchStory`, `getBatchTag` in `@kampus/library`
- [ ] Handlers flattened to named exports
- [ ] SqlError auto-caught in Spellbook via `wrapHandlers`
- [ ] `Spellcaster.make()` factory for typed RPC clients
- [ ] Effect Request types: `GetStory`, `GetTag`
- [ ] RequestResolvers: `StoryResolver`, `TagResolver` with batching
- [ ] GraphQL schema: `Library`, `Story`, `Tag`, `WebPage` types
- [ ] GraphQL mutations: `createStory`, `updateStory`, `deleteStory`, `createTag`
- [ ] `Library.webPage(url: String!)` field routes to WebPageParser DO

### Frontend
- [ ] Relay environment configured
- [ ] `LibraryRpc.tsx` migrated to Relay with fragments
- [ ] `StoryRow` fragment for story data
- [ ] Mutations use `useMutation` with optimistic updates
- [ ] effect-atom RPC atoms removed

### Quality
- [ ] `turbo run typecheck` passes
- [ ] `pnpm --filter worker run test` passes
- [ ] GraphQL queries work via curl

## Constraints

- Use graphql-js for schema (existing pattern in worker)
- Use graphql-yoga as server (existing)
- Auth at GraphQL layer, not Hono middleware
- No subscriptions for now
- Full Relay with fragments (not simplified queries)

## Dependencies

- Existing Spellbook DO infrastructure
- Existing graphql-yoga setup in worker
- WebPageParser DO for URL metadata fetching

## Out of Scope

- Subscriptions / real-time updates
- CLI generators
- Other pages beyond Library (this is the pilot)
- Removing effect-atom entirely (keep for local UI state)

## References

- RFC: https://github.com/kamp-us/kampus/issues/23
- Effect Batching docs: https://effect.website/docs/batching/
- Relay docs: https://relay.dev/docs/
