# Learnings

<!-- INDEX:START -->
| Date | Learning |
|------|--------|
| 2026-02-14 | useMux() object identity churn breaks terminal lifecycle |
| 2026-02-14 | ghostty-web container element must have no children |
| 2026-02-14 | Subagent-driven dev: always verify field signatures after restore |
| 2026-02-14 | layout-tree split() new pane path is implicit |
| 2026-02-14 | CF Sandbox API: reconnectable sandboxes with server-side buffering |
| 2026-02-14 | Zensical explicit nav is full override |
<!-- INDEX:END -->

## [2026-02-14-222747] useMux() object identity churn breaks terminal lifecycle

**Context**: use-channel-terminal depended on useMux() object in useEffect deps, causing constant listener cleanup/re-register and dead panes after split

**Lesson**: Context hooks returning objects with state create new references every render. Effects depending on the whole object churn and break during tree restructure.

**Application**: Destructure stable useCallback refs from context hooks. Use useRef for callbacks passed to ghostty-web.

---

## [2026-02-14-222745] ghostty-web container element must have no children

**Context**: Added split/close buttons as children of ghostty terminal ref div, terminal rendered as cursor at 0x0

**Lesson**: ghostty-web requires sole ownership of its container element. Child elements break terminal rendering.

**Application**: Render ghostty ref on a standalone div. Use sibling div with position:absolute for overlays.

---

## [2026-02-14-213217] Subagent-driven dev: always verify field signatures after restore

**Context**: Spec review caught Errors.ts agent using {message: Schema.String} instead of original {cause: Schema.Defect}. SandboxLive.ts constructs with cause/command/path params.

**Lesson**: When restoring deleted code via subagent, provide the EXACT original content, not a simplified version. Subagents infer from patterns and may get field names wrong.

**Application**: Include original file content verbatim in subagent prompts when restoring code.

---

## [2026-02-14-201157] layout-tree split() new pane path is implicit

**Context**: Designing TabbedLayout wrapper for Wormhole. split() doesn't return the new window's path.

**Lesson**: New pane path after split is [...path.slice(0,-1), path.at(-1)+1]. This is implicit knowledge about split internals.

**Application**: Use splitWith wrapper that computes newPath. Upstream split returning {tree, newPath} to @usirin/layout-tree (issue #40).

---

## [2026-02-14-200444] CF Sandbox API: reconnectable sandboxes with server-side buffering

**Context**: Designing Wormhole protocol on top of CF Sandbox. Needed to understand what CF handles natively vs what we need to build. Read CF Sandbox docs for terminal, sessions, and lifecycle APIs.

**Lesson**: getSandbox(binding, sandboxId) with same ID always returns same instance — sandboxes are reconnectable. CF provides server-side ring buffer for output (reconnect replays history). Containers sleep after ~10 min inactivity and shell state resets on wake. Sessions within a sandbox share filesystem but have independent shell state (env, cwd, history).

**Application**: Don't reimplement buffering or session state persistence — CF handles it. Design for container sleep as a normal event, not an error. Use sandboxId as stable identifier for reconnection. Treat sessions as lightweight (shared filesystem) and sandboxes as heavyweight (isolated environments).

---

## [2026-02-14-174753] Zensical explicit nav is full override

**Context**: Wanted auto-discovery for docs/plans/ in zensical nav

**Lesson**: Zensical explicit nav is full override — no glob, no partial auto-discovery

**Application**: Manually add each new plan file to zensical.toml nav
