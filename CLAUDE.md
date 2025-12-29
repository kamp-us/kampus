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

## Development Workflow - Spec-Driven Development

This project follows a **spec-driven development** approach where every feature is thoroughly specified before implementation.

**CRITICAL RULE: NEVER IMPLEMENT WITHOUT FOLLOWING THE COMPLETE SPEC FLOW**

### Mandatory Workflow Steps

**AUTHORIZATION PROTOCOL**: Before proceeding to any phase (2-5), you MUST:
1. Present the completed work from the current phase
2. Explicitly ask for user authorization to proceed
3. Wait for clear user approval before continuing
4. NEVER assume permission or proceed automatically

### Phase-by-Phase Process

| Phase | Deliverable | Gate |
| ----- | ----------- | ---- |
| 1 | `instructions.md` - capture user requirements, stories, acceptance criteria | — |
| 2 | `requirements.md` - structured functional/non-functional requirements | **REQUIRES APPROVAL** |
| 3 | `design.md` - technical design, architecture, Effect patterns | **REQUIRES APPROVAL** |
| 4 | `plan.md` - implementation roadmap and task breakdown | **REQUIRES APPROVAL** |
| 5 | Implementation - follow the plan exactly | **REQUIRES APPROVAL** |

### Specification Structure

```
specs/
├── README.md                    # Feature directory with completion status
└── [feature-name]/
    ├── instructions.md          # Initial requirements capture
    ├── requirements.md          # Structured requirements analysis
    ├── design.md                # Technical design and architecture
    └── plan.md                  # Implementation roadmap and progress
```

**`specs/README.md`**: Simple checkbox list of features
```markdown
- [x] **[feature-name](./feature-name/)** - Brief description
- [ ] **[another-feature](./another-feature/)** - Brief description
```

### Best Practices

- **One feature per spec folder**: Keep features focused and manageable
- **Iterative refinement**: Specs can evolve but major changes should be documented
- **Cross-reference**: Link between instruction/requirement/design/plan files
- **Progress tracking**: Update plan.md regularly during implementation
- **Effect-first design**: Consider Effect patterns and error handling in design phase

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
| Feature specs | `specs/[feature-name]/` |
| Design tokens | `apps/kamp-us/src/design/phoenix.{ts,css}` |
| GraphQL schema | `apps/worker/src/graphql/` |
| Feature implementations | `apps/worker/src/features/*/` |
| Relay artifacts | `__generated__/` directories (auto-generated) |
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
