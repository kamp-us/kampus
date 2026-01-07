# Feature Specifications

Feature directory with completion status. Each feature follows the [spec-driven development workflow](../CLAUDE.md#development-workflow---spec-driven-development).

## Features

- [ ] **[user-library-page](./user-library-page/)** - User-facing library page with story CRUD operations
- [ ] **[library-tags](./library-tags/)** - Add per-user tags with name and color to organize library stories
- [ ] **[relay-node-interface](./relay-node-interface/)** - Implement Relay Node interface for @refetchable fragment support
- [ ] **[frontend-story-tagging](./frontend-story-tagging/)** - Frontend UI for tagging stories (core MVP)
- [ ] **[frontend-tag-filtering](./frontend-tag-filtering/)** - Filter stories by clicking tags (planned)
- [x] **[frontend-tag-management](./frontend-tag-management/)** - Rename, recolor, delete tags
- [ ] **[fetch-title-from-url](./fetch-title-from-url/)** - Auto-fetch title and description from URL when submitting stories
- [x] **[relay-pagination](./relay-pagination/)** - Implement usePaginationFragment for Library "Load More" functionality
- [ ] **[effect-rpc](./effect-rpc/)** - Replace GraphQL with Effect RPC + effect-atom for Library feature
