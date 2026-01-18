# Requirements: Spellbook Generator CLI

Derived from [instructions.md](./instructions.md).

## Functional Requirements

### FR-1: Command Interface
| ID | Requirement |
|----|-------------|
| FR-1.1 | CLI accepts `kampus generate spellbook <feature-name>` command |
| FR-1.2 | Feature name validated as kebab-case |
| FR-1.3 | Duplicate feature detection (package/worker folder exists) |

### FR-2: Naming Conventions
| ID | Requirement |
|----|-------------|
| FR-2.1 | kebab-case input → PascalCase for class names |
| FR-2.2 | kebab-case input → snake_case for table names |
| FR-2.3 | kebab-case input → SCREAMING_SNAKE for bindings |
| FR-2.4 | Auto-derive 3-4 char ID prefix from feature name |
| FR-2.5 | `--table` overrides default table name |
| FR-2.6 | `--id-prefix` overrides default ID prefix |

### FR-3: Interactive TUI (via @opentui/react)
| ID | Requirement |
|----|-------------|
| FR-3.1 | Display styled header with feature name |
| FR-3.2 | Column definition loop: prompt name, type, nullable |
| FR-3.3 | Support column types: text, integer, boolean, timestamp |
| FR-3.4 | Tab/Enter to navigate between inputs |
| FR-3.5 | Display summary of columns before proceeding |
| FR-3.6 | Confirm prompt before file generation |
| FR-3.7 | Progress display during file generation |
| FR-3.8 | Success/error messages with colors |

### FR-4: Package Layer Generation
| ID | Requirement |
|----|-------------|
| FR-4.1 | Create `packages/<feature>/package.json` with @kampus scope |
| FR-4.2 | Create `packages/<feature>/tsconfig.json` extending root |
| FR-4.3 | Create `packages/<feature>/src/index.ts` with re-exports |
| FR-4.4 | Create `packages/<feature>/src/errors.ts` scaffold |
| FR-4.5 | Create `packages/<feature>/src/schema.ts` with user-defined columns |
| FR-4.6 | Create `packages/<feature>/src/rpc.ts` with get/list RPCs |

### FR-5: Worker Layer Generation
| ID | Requirement |
|----|-------------|
| FR-5.1 | Create `apps/worker/src/features/<feature>/<Feature>.ts` with Spellbook.make() |
| FR-5.2 | Create `apps/worker/src/features/<feature>/handlers.ts` with get/list handlers |
| FR-5.3 | Create `apps/worker/src/features/<feature>/drizzle/drizzle.config.ts` |
| FR-5.4 | Create `apps/worker/src/features/<feature>/drizzle/drizzle.schema.ts` with columns |
| FR-5.5 | Create migrations folder with empty migrations.js and _journal.json |

### FR-6: Integration Updates
| ID | Requirement |
|----|-------------|
| FR-6.1 | Add DO export to `apps/worker/src/index.ts` |
| FR-6.2 | Add binding to `wrangler.jsonc` durable_objects.bindings |
| FR-6.3 | Add migration entry to `wrangler.jsonc` migrations array |
| FR-6.4 | Preserve JSONC comments when updating wrangler.jsonc |

### FR-7: Auto Drizzle-Kit
| ID | Requirement |
|----|-------------|
| FR-7.1 | Execute `pnpm exec drizzle-kit generate` after schema creation |
| FR-7.2 | Use feature-specific drizzle.config.ts path |
| FR-7.3 | Display drizzle-kit output in TUI |
| FR-7.4 | `--skip-drizzle` flag skips this step |

### FR-8: Optional Extras
| ID | Requirement |
|----|-------------|
| FR-8.1 | `--with-test`: Create `apps/worker/test/<feature>.spec.ts` |
| FR-8.2 | `--with-graphql`: Create resolver + update schema.ts |
| FR-8.3 | `--with-route`: Add `/rpc/<feature>/*` route to index.ts |
| FR-8.4 | `--with-all`: Enable all extras |

### FR-9: Dry Run Mode
| ID | Requirement |
|----|-------------|
| FR-9.1 | `--dry-run` shows file tree without writing |
| FR-9.2 | Display file contents preview in dry run |
| FR-9.3 | No side effects in dry run mode |

## Non-Functional Requirements

### NFR-1: Technology Stack
| ID | Requirement |
|----|-------------|
| NFR-1.1 | Use @effect/cli for command parsing |
| NFR-1.2 | Use @opentui/react for TUI rendering |
| NFR-1.3 | Use @effect/platform FileSystem for file operations |
| NFR-1.4 | Use Effect.gen() for all async operations |

### NFR-2: Code Quality
| ID | Requirement |
|----|-------------|
| NFR-2.1 | Generated code passes `biome check` |
| NFR-2.2 | Generated code passes `turbo run typecheck` |
| NFR-2.3 | Templates match existing library/web-page-parser patterns exactly |

### NFR-3: User Experience
| ID | Requirement |
|----|-------------|
| NFR-3.1 | Clear error messages for validation failures |
| NFR-3.2 | Colored output for status (green=success, red=error, yellow=warn) |
| NFR-3.3 | Non-blocking TUI (responsive to keyboard input) |

### NFR-4: Maintainability
| ID | Requirement |
|----|-------------|
| NFR-4.1 | Templates as pure functions returning strings |
| NFR-4.2 | Naming utils as separate module |
| NFR-4.3 | Integration logic as separate module |

## Traceability Matrix

| Acceptance Criteria | Requirements |
|---------------------|--------------|
| Core generator command | FR-1.1, FR-1.2 |
| Naming conventions | FR-2.1 - FR-2.6 |
| Interactive prompts | FR-3.1 - FR-3.8 |
| Package layer files | FR-4.1 - FR-4.6 |
| Worker layer files | FR-5.1 - FR-5.5 |
| Integration updates | FR-6.1 - FR-6.4 |
| Auto drizzle-kit | FR-7.1 - FR-7.4 |
| Optional extras | FR-8.1 - FR-8.4 |
| Dry run mode | FR-9.1 - FR-9.3 |
