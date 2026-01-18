# PRD Iteration

Work on a single feature from a PRD file, following a structured workflow.

## Arguments
- `$ARGUMENTS` - Path to PRD JSON file (required)

## Workflow

1. **Read PRD, spec and Progress**
   - Read the PRD file at `$ARGUMENTS`
   - read the spec files in that directory
   - Read the corresponding `progress.txt` in the same directory
   - Identify the highest-priority incomplete item (your judgment, not just first in list)

2. **Implement Feature**
   - Work on ONLY that single feature
   - Run `turbo run typecheck` to verify types
   - Run `turbo run test` to verify tests pass
   - Use playwright mcp to verify ui changes if applicable
   - Do not try to run the dev servers, they are already running in a tmux pane, figure it out and read the output from that

3. **Update PRD**
   - Set `passes: true` for completed items
   - Update `summary.passed` count
   - Modify `stepsToVerify` if implementation differs from original plan

4. **Append to Progress File**
   Keep entries concise. Include:
   - Date and PRD item reference (e.g., "## 2026-01-15: Feature Name (SP-XXX)")
   - Files changed
   - Key decisions and reasoning
   - Blockers or notes for next iteration

5. **Ensure Spec Files Up to Date**
   - Update design.md, requirements.md if implementation diverged
   - Keep specs in sync with actual code

6. **Commit**
   - Stage only files related to the feature
   - Use conventional commit format: `feat|fix|chore(scope): description`

## Output

If PRD is complete (all items pass), update the specs/README.md file and mark it completed.

Otherwise, summarize what was done and what remains.
