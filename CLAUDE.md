# kampus

React + Effect.ts + Cloudflare Workers monorepo. Uses pnpm workspaces.

## Commands

```bash
pnpm install
turbo run dev | build | typecheck | test
biome check --write --staged  # before commit
```

## pnpm over npm

- all commands use `pnpm` instead of `npm` or `yarn`.
- never use `npx ...` use `pnpm dlx ...` instead.

## Docs

| Task | Read |
|------|------|
| Backend feature / DO | `apps/worker/CLAUDE.md` |
| Frontend UI / Relay | `apps/kamp-us/CLAUDE.md` |
| Effect services, errors | `.claude/docs/effect-patterns.md` |
| New feature spec | `.claude/docs/spec-workflow.md` |
| Something not working | `.claude/docs/gotchas.md` |

## External Sources

| What | Where |
|------|-------|
| Local Effect source | `~/.local/share/effect-solutions/effect/` |
| Local ghostty-web source | `~/code/github.com/usirin/ghostty-web` |
| Local effect-atom source | `~/code/github.com/usirin/effect-atom/` |

