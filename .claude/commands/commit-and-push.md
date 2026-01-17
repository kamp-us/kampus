# Commit and Push

Create isolated, granular commits for related changes and push them. Creates a PR if one doesn't exist for the current branch.

## Workflow

### Step 1: Analyze Changes

Run these commands to understand the current state:

```bash
git status
git diff --stat
git diff --staged --stat
git log --oneline -5
git branch --show-current
```

### Step 2: Check for Existing PR

```bash
gh pr view --json number,title,url 2>/dev/null || echo "NO_PR"
```

### Step 3: Group Changes into Logical Commits

Analyze all changed files and group them by:
- **Feature/functionality**: Files that implement the same feature together
- **Layer**: Backend changes separate from frontend changes when they're independent
- **Type**: Schema/types, implementation, tests, docs

For each group, create a separate commit with a clear, descriptive message.

### Step 4: Create Granular Commits

For each logical group:

1. Stage only the related files:
   ```bash
   git add <file1> <file2> ...
   ```

2. Create a commit with a descriptive message:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>: <short description>

   <optional body explaining what and why>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   EOF
   )"
   ```

**Commit types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`

### Step 5: Push Changes

```bash
git push
```

If the branch has no upstream:
```bash
git push -u origin $(git branch --show-current)
```

### Step 6: Create or Update PR

**If NO PR exists**, create one:

```bash
gh pr create --title "<concise title>" --body "$(cat <<'EOF'
## Summary
<bullet points of what changed>

## Changes
<list of commits with brief descriptions>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**If PR exists**, just confirm the push was successful and show the PR URL.

## Guidelines

- **Atomic commits**: Each commit should be a single logical change that could be reverted independently
- **Clear messages**: Commit messages should explain *what* changed and *why*
- **No mixing concerns**: Don't combine unrelated changes in a single commit
- **Buildable commits**: Each commit should leave the codebase in a buildable state when possible

## Example Groupings

| Files | Commit |
|-------|--------|
| `schema.ts`, `types.ts` | `feat: add subscription event types` |
| `Library.ts` | `feat: add realtime event publishing to Library DO` |
| `UserChannel.ts`, `UserChannel/types.ts` | `feat: implement UserChannel DO for WebSocket subscriptions` |
| `environment.ts`, `websocket.ts` | `feat: add graphql-ws subscription client` |
| `Library.tsx` | `feat: subscribe to library channel for realtime updates` |
| `*.spec.ts` | `test: add tests for subscription handling` |

## Constraints

- Never force push unless explicitly requested
- Never push to `main` or `master` directly
- Always include the Claude Code attribution in commits
- If unsure about groupings, ask before committing
