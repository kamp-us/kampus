# Implementation Plan: Spellbook Generator CLI

Derived from [design.md](./design.md).

## Implementation Order

### Phase 1: Command Wiring
| Task | Status | Files |
|------|--------|-------|
| Create generate parent command | [x] | `commands/generate/generate.ts` |
| Create spellbook command stub | [x] | `commands/generate/spellbook/spellbook.ts` |
| Wire generate into kampus-effect.tsx | [x] | `bin/kampus-effect.tsx` |
| Add jsonc-parser dependency | [ ] | `apps/cli/package.json` |
| Verify `kampus generate spellbook --help` works | [x] | — |

### Phase 2: Types, Naming & Validation
| Task | Status | Files |
|------|--------|-------|
| Create shared types (Column, Naming, GeneratorOptions) | [ ] | `generators/spellbook/types.ts` |
| Implement deriveNaming function | [ ] | `generators/spellbook/naming.ts` |
| Implement kebab→Pascal, snake_case, SCREAMING_SNAKE | [ ] | `generators/spellbook/naming.ts` |
| Implement ID prefix derivation | [ ] | `generators/spellbook/naming.ts` |
| Implement validateFeatureName (kebab-case check) | [ ] | `generators/spellbook/validation.ts` |
| Implement checkFeatureExists | [ ] | `generators/spellbook/validation.ts` |
| Add tests for naming utils | [ ] | `generators/spellbook/naming.test.ts` |

### Phase 3: TUI Components
| Task | Status | Files |
|------|--------|-------|
| Create App.tsx root component | [ ] | `commands/generate/spellbook/App.tsx` |
| Implement state machine (input/confirm/generating/success/error) | [ ] | `commands/generate/spellbook/App.tsx` |
| Create ColumnInput component | [ ] | `commands/generate/spellbook/components/ColumnInput.tsx` |
| Create ColumnList component | [ ] | `commands/generate/spellbook/components/ColumnList.tsx` |
| Create Progress component | [ ] | `commands/generate/spellbook/components/Progress.tsx` |
| Create Summary component | [ ] | `commands/generate/spellbook/components/Summary.tsx` |
| Connect renderApp to spellbook command | [ ] | `commands/generate/spellbook/spellbook.ts` |

### Phase 4: Package Layer Templates
| Task | Status | Files |
|------|--------|-------|
| Template: package.json | [ ] | `generators/spellbook/templates/package.ts` |
| Template: tsconfig.json | [ ] | `generators/spellbook/templates/package.ts` |
| Template: src/index.ts | [ ] | `generators/spellbook/templates/package.ts` |
| Template: src/errors.ts | [ ] | `generators/spellbook/templates/package.ts` |
| Template: src/schema.ts (with columns) | [ ] | `generators/spellbook/templates/package.ts` |
| Template: src/rpc.ts | [ ] | `generators/spellbook/templates/package.ts` |
| Column type → Schema type mapping | [ ] | `generators/spellbook/templates/package.ts` |

### Phase 5: Worker Layer Templates
| Task | Status | Files |
|------|--------|-------|
| Template: <Feature>.ts (Spellbook.make) | [ ] | `generators/spellbook/templates/worker.ts` |
| Template: handlers.ts | [ ] | `generators/spellbook/templates/worker.ts` |
| Template: drizzle/drizzle.config.ts | [ ] | `generators/spellbook/templates/worker.ts` |
| Template: drizzle/drizzle.schema.ts (with columns) | [ ] | `generators/spellbook/templates/worker.ts` |
| Template: drizzle/migrations/migrations.js | [ ] | `generators/spellbook/templates/worker.ts` |
| Template: drizzle/migrations/meta/_journal.json | [ ] | `generators/spellbook/templates/worker.ts` |
| Column type → Drizzle type mapping | [ ] | `generators/spellbook/templates/worker.ts` |

### Phase 6: File Generation
| Task | Status | Files |
|------|--------|-------|
| Implement useGenerator hook | [ ] | `commands/generate/spellbook/hooks/useGenerator.ts` |
| Create directories recursively | [ ] | `commands/generate/spellbook/hooks/useGenerator.ts` |
| Write package layer files | [ ] | `commands/generate/spellbook/hooks/useGenerator.ts` |
| Write worker layer files | [ ] | `commands/generate/spellbook/hooks/useGenerator.ts` |
| Dry-run mode (preview only) | [ ] | `commands/generate/spellbook/hooks/useGenerator.ts` |

### Phase 7: Integration Updates
| Task | Status | Files |
|------|--------|-------|
| Implement updateWorkerIndex | [ ] | `generators/spellbook/integrations.ts` |
| Implement updateWranglerJsonc | [ ] | `generators/spellbook/integrations.ts` |
| JSONC comment preservation | [ ] | `generators/spellbook/integrations.ts` |
| Validate feature doesn't exist | [ ] | `generators/spellbook/integrations.ts` |

### Phase 8: Drizzle-Kit Integration
| Task | Status | Files |
|------|--------|-------|
| Implement runDrizzleKit function | [ ] | `generators/spellbook/drizzle.ts` |
| Stream drizzle-kit output to TUI | [ ] | `generators/spellbook/drizzle.ts` |
| Handle drizzle-kit errors | [ ] | `generators/spellbook/drizzle.ts` |
| Skip with --skip-drizzle flag | [ ] | `commands/generate/spellbook/spellbook.ts` |

### Phase 9: Optional Extras
| Task | Status | Files |
|------|--------|-------|
| Template: test file | [ ] | `generators/spellbook/templates/test.ts` |
| Template: GraphQL resolver | [ ] | `generators/spellbook/templates/graphql.ts` |
| Template: GraphQL schema additions | [ ] | `generators/spellbook/templates/graphql.ts` |
| RPC route insertion | [ ] | `generators/spellbook/integrations.ts` |
| Wire --with-test, --with-graphql, --with-route, --with-all | [ ] | `commands/generate/spellbook/spellbook.ts` |

### Phase 10: Testing
| Task | Status | Files |
|------|--------|-------|
| **Unit Tests** | | |
| Test deriveNaming with various inputs | [ ] | `generators/spellbook/naming.test.ts` |
| Test kebab-case validation | [ ] | `generators/spellbook/validation.test.ts` |
| Test feature existence check | [ ] | `generators/spellbook/validation.test.ts` |
| Test column type → Schema type mapping | [ ] | `generators/spellbook/templates/package.test.ts` |
| Test column type → Drizzle type mapping | [ ] | `generators/spellbook/templates/worker.test.ts` |
| Test all package layer templates output | [ ] | `generators/spellbook/templates/package.test.ts` |
| Test all worker layer templates output | [ ] | `generators/spellbook/templates/worker.test.ts` |
| **Integration Tests** | | |
| Test full generation in temp directory | [ ] | `generators/spellbook/generator.test.ts` |
| Test --dry-run produces no files | [ ] | `generators/spellbook/generator.test.ts` |
| Test index.ts export insertion | [ ] | `generators/spellbook/integrations.test.ts` |
| Test wrangler.jsonc modification | [ ] | `generators/spellbook/integrations.test.ts` |
| Test wrangler.jsonc preserves comments | [ ] | `generators/spellbook/integrations.test.ts` |
| Test duplicate feature detection | [ ] | `generators/spellbook/generator.test.ts` |
| Test invalid feature name rejection | [ ] | `generators/spellbook/generator.test.ts` |
| **E2E Tests** | | |
| Generate feature, run typecheck | [ ] | `generators/spellbook/e2e.test.ts` |
| Generate feature, run biome check | [ ] | `generators/spellbook/e2e.test.ts` |
| Generate feature, verify RPC handlers work | [ ] | `generators/spellbook/e2e.test.ts` |
| Test --with-test generates valid test file | [ ] | `generators/spellbook/e2e.test.ts` |
| Test --with-graphql generates valid resolver | [ ] | `generators/spellbook/e2e.test.ts` |

### Phase 11: Polish
| Task | Status | Files |
|------|--------|-------|
| Colored output (success/error/warn) | [ ] | TUI components |
| Validation error messages | [ ] | `commands/generate/spellbook/App.tsx` |
| Help text improvements | [ ] | `commands/generate/spellbook/spellbook.ts` |

## File Creation Summary

**New Files (commands/generate/):**
- `generate.ts`
- `spellbook/spellbook.ts`
- `spellbook/App.tsx`
- `spellbook/components/ColumnInput.tsx`
- `spellbook/components/ColumnList.tsx`
- `spellbook/components/Progress.tsx`
- `spellbook/components/Summary.tsx`
- `spellbook/hooks/useGenerator.ts`

**New Files (generators/spellbook/):**
- `types.ts`
- `naming.ts`
- `validation.ts`
- `integrations.ts`
- `drizzle.ts`
- `templates/package.ts`
- `templates/worker.ts`
- `templates/test.ts`
- `templates/graphql.ts`

**Test Files (generators/spellbook/):**
- `naming.test.ts`
- `validation.test.ts`
- `generator.test.ts`
- `integrations.test.ts`
- `e2e.test.ts`
- `templates/package.test.ts`
- `templates/worker.test.ts`

**Modified Files:**
- `bin/kampus-effect.tsx` (add generate subcommand)
- `package.json` (add jsonc-parser dependency)

## Verification Steps

1. **Command works**: `pnpm --filter cli run dev && kampus generate spellbook --help`
2. **Dry run**: `kampus generate spellbook test-feature --dry-run`
3. **Full generation**: `kampus generate spellbook test-feature`
4. **Typecheck passes**: `turbo run typecheck`
5. **Lint passes**: `biome check .`
6. **Generated feature works**: Add route, start worker, test RPC

## Dependencies

```
Phase 1 (Command) ─┬─► Phase 2 (Types/Naming/Validation)
                   │
                   └─► Phase 3 (TUI) ──────────────────┐
                                                       │
Phase 2 ───────────┬─► Phase 4 (Package Templates) ───┤
                   │                                   │
                   └─► Phase 5 (Worker Templates) ────┤
                                                       │
                   ┌───────────────────────────────────┘
                   ▼
            Phase 6 (File Generation)
                   │
                   ▼
            Phase 7 (Integration Updates)
                   │
                   ├─► Phase 8 (Drizzle-Kit)
                   │
                   └─► Phase 9 (Optional Extras)
                   │
                   ▼
            Phase 10 (Testing) ──► Phase 11 (Polish)
```

**Parallelizable:**
- Phases 3, 4, 5 can run in parallel (all depend only on Phase 2)
- Phases 8, 9 can run in parallel (both depend on Phase 7)

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| @opentui/react API unfamiliar | Reference existing tui.tsx, use only box/text/input |
| JSONC parsing | Use jsonc-parser (VS Code's battle-tested library) |
| drizzle-kit process streaming | Use @effect/platform Command |
| Integration file corruption | Validate before write, use jsonc-parser's edit operations |
| Generated code quality | Extensive template tests + E2E typecheck/lint verification |
| Test coverage gaps | Unit tests for pure functions, integration tests for file ops |
