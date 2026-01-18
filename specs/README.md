# Feature Specifications

Feature directory with completion status. Each feature follows the [spec-driven development workflow](../CLAUDE.md#development-workflow---spec-driven-development).

## Features

- [x] **[user-library-page](./user-library-page/)** - User-facing library page with story CRUD operations
- [x] **[library-tags](./library-tags/)** - Add per-user tags with name and color to organize library stories
- [x] **[relay-node-interface](./relay-node-interface/)** - Implement Relay Node interface for @refetchable fragment support
- [x] **[frontend-story-tagging](./frontend-story-tagging/)** - Frontend UI for tagging stories (core MVP)
- [x] **[frontend-tag-filtering](./frontend-tag-filtering/)** - Filter stories by clicking tags (planned)
- [x] **[frontend-tag-management](./frontend-tag-management/)** - Rename, recolor, delete tags
- [x] **[fetch-title-from-url](./fetch-title-from-url/)** - Auto-fetch title and description from URL when submitting stories
- [x] **[relay-pagination](./relay-pagination/)** - Implement usePaginationFragment for Library "Load More" functionality
- [x] **[effect-rpc](./effect-rpc/)** - Replace GraphQL with Effect RPC + effect-atom for Library feature
- [x] **[spellbook](./spellbook/)** - Refactor DO infrastructure: Spellbook.make pattern, pure handlers, @effect/sql
- [x] **[effect-sql-model](./effect-sql-model/)** - Adopt @effect/sql Model abstraction for cleaner handlers
- [x] **[effect-sql-drizzle](./effect-sql-drizzle/)** - Replace Model.Class with @effect/sql-drizzle for single schema source
- [x] **[graphql-ftw](./graphql-ftw/)** - GraphQL + Relay data layer replacing effect-atom RPC
- [x] **[spellbook-generator](./spellbook-generator/)** - Rails-style CLI generator for Spellbook scaffolding
