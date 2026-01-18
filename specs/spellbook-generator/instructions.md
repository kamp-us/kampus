# Spellbook Generator CLI

## Feature Overview

Rails-style CLI generators for the Effect/Spellbook ecosystem. Automates creation of Durable Object features by scaffolding all required boilerplate files across packages and the worker app.

**Why needed:** Creating a new Spellbook-based feature currently requires manually creating ~15-20 files across `packages/[feature]/` and `apps/worker/src/features/[feature]/`, plus updating `wrangler.jsonc` and `index.ts`. This is error-prone and tedious.

## User Stories

1. **As a developer**, I want to run `kampus generate spellbook <name>` to scaffold a complete Spellbook feature so I can start implementing business logic immediately.

2. **As a developer**, I want interactive prompts for table columns so I don't need to remember drizzle schema syntax.

3. **As a developer**, I want the generator to auto-run `drizzle-kit generate` so migrations are ready without manual steps.

4. **As a developer**, I want optional extras (tests, GraphQL, routes) behind flags so I can include them when needed.

## Acceptance Criteria

### Core Generator
- [ ] `kampus generate spellbook <feature-name>` creates all required files
- [ ] Naming conventions applied: kebab-case → PascalCase/snake_case/SCREAMING_SNAKE
- [ ] Interactive prompts for column definitions (name, type, nullable)
- [ ] Auto-runs `drizzle-kit generate` to create SQL migrations
- [ ] Updates `apps/worker/src/index.ts` with DO export
- [ ] Updates `apps/worker/wrangler.jsonc` with binding + migration tag
- [ ] `--dry-run` flag shows files without writing

### Generated Files (Package Layer)
- [ ] `packages/<feature>/package.json`
- [ ] `packages/<feature>/tsconfig.json`
- [ ] `packages/<feature>/src/index.ts`
- [ ] `packages/<feature>/src/errors.ts`
- [ ] `packages/<feature>/src/schema.ts` (with user-defined columns)
- [ ] `packages/<feature>/src/rpc.ts` (get/list methods)

### Generated Files (Worker Layer)
- [ ] `apps/worker/src/features/<feature>/<Feature>.ts` (Spellbook.make)
- [ ] `apps/worker/src/features/<feature>/handlers.ts`
- [ ] `apps/worker/src/features/<feature>/drizzle/drizzle.config.ts`
- [ ] `apps/worker/src/features/<feature>/drizzle/drizzle.schema.ts`
- [ ] `apps/worker/src/features/<feature>/drizzle/migrations/*` (via drizzle-kit)

### Optional Extras (behind flags)
- [ ] `--with-test`: generates `apps/worker/test/<feature>.spec.ts`
- [ ] `--with-graphql`: generates resolver + schema stubs
- [ ] `--with-route`: adds `/rpc/<feature>/*` route to index.ts
- [ ] `--with-all`: enables all extras

### Options
- [ ] `--table <name>`: override table name
- [ ] `--id-prefix <prefix>`: override ID prefix for @usirin/forge
- [ ] `--skip-wrangler`: don't update wrangler.jsonc
- [ ] `--skip-index`: don't update index.ts
- [ ] `--skip-drizzle`: don't run drizzle-kit generate

## Constraints

- **Must use @effect/cli** - not Bluebun (Effect CLI is the target framework)
- **Must use @opentui/react** - for interactive TUI prompts and output
- **Must use @effect/platform FileSystem** - for file operations
- **Must follow existing patterns** - match library/web-page-parser structure exactly
- **Must handle JSONC** - wrangler.jsonc has comments that must be preserved

## Dependencies

- Existing CLI app at `apps/cli/`
- Existing Effect CLI entry at `apps/cli/bin/kampus-effect.tsx`
- Reference implementations: `apps/worker/src/features/library/`, `packages/library/`
- Drizzle Kit for migrations

## Out of Scope

- Migrating existing Bluebun commands to Effect CLI
- GUI/TUI for generator (command line only)
- Undo/rollback functionality
- Generator for non-Spellbook features
