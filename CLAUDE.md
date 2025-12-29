# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all dev servers (frontend + backend workers)
turbo run dev

# Run linting
turbo run lint

# Run tests
turbo run test

# Build all apps
turbo run build
```

### App-Specific Commands

```bash
# Frontend (kamp-us)
pnpm --filter kamp-us run dev          # Vite dev server
pnpm --filter kamp-us run schema:fetch # Fetch GraphQL schema from backend
pnpm --filter kamp-us run relay        # Compile Relay artifacts
pnpm --filter kamp-us run relay:watch  # Watch mode for Relay

# Backend (worker)
pnpm --filter worker run dev           # Wrangler dev server
pnpm --filter worker run test          # Run Vitest tests

# Deploy to Cloudflare
pnpm --filter kamp-us run deploy
pnpm --filter worker run deploy
```

## Architecture

### Monorepo Structure

- `apps/kamp-us` - React frontend served via Cloudflare Worker
- `apps/worker` - Backend GraphQL API (Cloudflare Worker)
- `apps/cli` - Effect-based CLI application

### Request Flow

```
Browser → kamp-us Worker → Backend Worker (via service binding)
           ├─ /graphql    → GraphQL Yoga server
           ├─ /api/auth/* → Better Auth endpoints
           └─ static      → Vite-built assets
```

### Key Technologies

- **Effect.ts** for type-safe functional programming patterns
- **GQLoom** (`@gqloom/core`, `@gqloom/effect`) for GraphQL schema definition
using Effect Schema
- **Relay** for client-side GraphQL data fetching and caching
- **Durable Objects** for stateful serverless storage (each instance has SQLite
via Drizzle ORM)
- **Better Auth** for authentication (email/password, API keys)

### Durable Objects Pattern

Backend features use Cloudflare Durable Objects with per-instance SQLite:

- `apps/worker/src/features/pasaport/` - Authentication & API keys
- `apps/worker/src/features/library/` - User story collections
- `apps/worker/src/features/web-page-parser/` - Web page metadata caching

Each Durable Object has its own schema in `drizzle/drizzle.schema.ts` with migrations.

### Relay Global IDs

The codebase implements Relay's global object identification pattern:

```typescript
// apps/worker/src/graphql/relay.ts
encodeGlobalId("User", userId) // → base64 encoded "User:userId"
decodeGlobalId(globalId)       // → {type: "User", id: "..."}
```

Connection helpers for cursor-based pagination: `createConnectionSchema`, `getConnectionSlice`

## Code Style

Uses **Biome** for formatting and linting:

- Line width: 100
- Bracket spacing: false (`{foo}` not `{ foo }`)
- Tab indentation for JSON
- Import organization enabled

Run `biome check .` to check, `biome format . --write` to format.

## Design System

The frontend design system lives in `apps/kamp-us/src/design/`. When using components from this folder:

- **Never apply custom styles** to design system components via `className` or inline styles
- If a component needs a new variant or style, update the design system component itself
- Available components: `Button`, `Input`, `IconButton`, `PasswordInput`

## Local Effect Source

The Effect repository is cloned to `~/code/opensource/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.
