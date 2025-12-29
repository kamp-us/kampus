# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Development Commands

```bash
pnpm install              # Install dependencies
turbo run dev             # Start all dev servers
turbo run lint            # Run linting
turbo run test            # Run tests
turbo run build           # Build all apps
```

### App-Specific Commands

```bash
# Frontend (kamp-us)
pnpm --filter kamp-us run dev          # Vite dev server
pnpm --filter kamp-us run schema:fetch # Fetch GraphQL schema from backend
pnpm --filter kamp-us run relay        # Compile Relay artifacts

# Backend (worker)
pnpm --filter worker run dev           # Wrangler dev server
pnpm --filter worker run test          # Run Vitest tests
```

## Architecture

```
apps/
├── kamp-us/   # React frontend (Cloudflare Worker)
├── worker/    # Backend GraphQL API (Cloudflare Worker)
└── cli/       # Effect-based CLI application
```

**Request flow:**
```
Browser → kamp-us Worker → Backend Worker (service binding)
           ├─ /graphql    → GraphQL Yoga
           ├─ /api/auth/* → Better Auth
           └─ static      → Vite assets
```

## Patterns & Conventions

### Design System

Components in `apps/kamp-us/src/design/` follow these patterns:

- Each component has a `.tsx` file paired with a `.module.css` file
- Components extend **Base UI** primitives (`@base-ui/react/*`)
- Props **omit `className`** to prevent style overrides—this is intentional
- State styling uses data attributes: `[data-focused]`, `[data-invalid]`, `[data-disabled]`
- Design tokens live in `phoenix.ts` (types) and `phoenix.css` (CSS variables)

**When working with the design system:**
- Never apply custom styles via `className` or inline styles
- Add new variants to existing components rather than one-off styles
- For complex components, use the compound component pattern (see Fieldset)

### Backend Features

Features in `apps/worker/src/features/` follow a standard structure:

```
feature-name/
├── FeatureName.ts      # Durable Object class
├── schema.ts           # Effect Schema definitions
└── drizzle/
    ├── drizzle.schema.ts   # Database schema
    └── migrations/         # SQL migrations
```

**Conventions:**
- Durable Objects extend `DurableObject<Env>` with migrations in constructor
- Use `Schema.Struct()` not `Schema.Class()` (DOs can't return class instances)
- ID generation: `id("prefix")` from `@usirin/forge` (e.g., `id("story")`, `id("user")`)
- Export DO classes from `src/index.ts`, add bindings in `wrangler.jsonc`

### GraphQL

- **GQLoom** (`@gqloom/core`, `@gqloom/effect`) for schema definition using Effect Schema
- **Relay** patterns for global IDs and cursor-based pagination
- Helpers in `apps/worker/src/graphql/relay.ts`: `encodeGlobalId`, `decodeGlobalId`, `createConnectionSchema`

### Code Style

Uses **Biome** for formatting and linting:

- Line width: 100
- Bracket spacing: false (`{foo}` not `{ foo }`)
- Run `biome check .` or `biome format . --write`

## Principles

- **Effect.ts** for all async/error handling—not raw Promises
- **Effect Schema** for data structures—not Zod or plain TypeScript interfaces
- **Base UI** for interactive components—extend, don't rebuild
- **Drizzle + SQLite** for persistence in Durable Objects—not KV
- Keep Durable Objects focused: one responsibility per DO

## Finding Things

| What | Where |
| ------ | ------- |
| Design tokens | `apps/kamp-us/src/design/phoenix.{ts,css}` |
| GraphQL schema | `apps/worker/src/graphql/` |
| Feature implementations | `apps/worker/src/features/*/` |
| Relay artifacts | `__generated__/` directories (auto-generated) |
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
