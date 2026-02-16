# Wormhole UI Redesign — Refined Industrial

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task.

**Goal:** Replace the unstyled wormhole terminal UI with the Refined
Industrial design from `docs/mockups/terminal-refined-industrial.html`,
using base-ui components for interactive chrome.

**Architecture:** Merge SessionBar + TabBar into a single ChromeBar
component. Session selector becomes a base-ui Menu dropdown. Tab bar
becomes base-ui Tabs (controlled, no panels). TerminalPane gets SVG
icon buttons, focus glow, and a styled disconnected overlay. All
styling lives in CSS Modules with wormhole-scoped design tokens.

**Tech Stack:** React 19, `@base-ui/react` (Menu, Tabs),
`react-resizable-panels`, `ghostty-web`, CSS Modules, JetBrains Mono

**Skills:** Agents doing UI/CSS work MUST have the
`frontend-design:frontend-design` skill loaded for design quality
guidance.

**Reference:** `docs/mockups/terminal-refined-industrial.html` (the
complete HTML mockup — consult for exact token values, class names,
and visual behavior)

---

## Task 1: Add JetBrains Mono font

**Files:**
- Modify: `apps/kamp-us/index.html`

**Step 1: Add Google Fonts preconnect and stylesheet link**

Add before `</head>` in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
```

**Step 2: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS (no type changes, just HTML)

**Step 3: Commit**

```bash
git add apps/kamp-us/index.html
git commit -m "feat(wormhole): add JetBrains Mono font import"
```

---

## Task 2: Wormhole design tokens

**Files:**
- Create: `apps/kamp-us/src/wormhole/wormhole-tokens.css`
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

**Step 1: Create the tokens file**

Create `wormhole-tokens.css` with all design tokens from the mockup.
This file defines a `.wormhole` scope so tokens don't leak into the
rest of the app:

```css
.wormhole {
  /* backgrounds */
  --wh-bg-base: #0e0e0e;
  --wh-bg-surface: #141414;
  --wh-bg-elevated: #1a1a1a;
  --wh-bg-hover: #222;

  /* text */
  --wh-text-primary: #c8c8c8;
  --wh-text-secondary: #686868;
  --wh-text-muted: #404040;
  --wh-text-bright: #e8e8e8;

  /* accent */
  --wh-accent: #c9a24d;
  --wh-accent-dim: rgba(201, 162, 77, 0.08);
  --wh-accent-glow: rgba(201, 162, 77, 0.15);

  /* borders */
  --wh-border: #1e1e1e;

  /* danger */
  --wh-danger: #b34040;
  --wh-danger-hover: #cc4c4c;

  /* typography */
  --wh-font: "JetBrains Mono", monospace;

  /* dimensions */
  --wh-chrome-height: 34px;
  --wh-radius: 2px;

  /* apply base styles */
  font-family: var(--wh-font);
  background: var(--wh-bg-base);
  color: var(--wh-text-primary);
  -webkit-font-smoothing: antialiased;
}
```

**Step 2: Import tokens in the CSS module**

Replace the entire `WormholeLayout.module.css` with just an import and
the `.container` class using the `.wormhole` scope. The other classes
will be added in later tasks:

```css
@import "./wormhole-tokens.css";

.container {
  composes: wormhole from "./wormhole-tokens.css";
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
```

Wait — CSS Modules `composes` from a non-module file can be tricky.
Instead, apply the `.wormhole` class via the container element and
import the tokens file normally. The `.container` in the module just
handles layout; the tokens file is a plain CSS file imported for its
custom properties.

Revised approach: Make the tokens a regular CSS file that sets
properties on a data attribute selector:

```css
/* wormhole-tokens.css */
[data-wormhole] {
  /* ... all tokens ... */
}
```

Then in `WormholeLayout.module.css`, just import it and reference
the variables. MuxClient adds `data-wormhole` to the root div.

**Step 3: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/kamp-us/src/wormhole/wormhole-tokens.css
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git commit -m "feat(wormhole): add design tokens and base container styles"
```

---

## Task 3: Restyle container, pane, and resize handles

**Files:**
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

**Step 1: Replace all styles**

The full CSS module. Match the mockup exactly. Key classes:

- `.container` — flex column, full viewport, imports tokens
- `.pane` — relative, flex column, transparent outline that becomes
  accent on `[data-focused]`, with glow box-shadow
- `.pane:not([data-focused]) .terminalContent` — opacity 0.55
  (not the whole pane — just the terminal content area)
- `.paneControls` — absolute top-right, opacity 0 until pane hover,
  buttons with backdrop blur and SVG sizing
- `.paneControls .closeBtn:hover` — danger color
- `.resizeHandleH` / `.resizeHandleV` — 1px, accent on hover, `::after`
  pseudo-element for grab dots (radial-gradient)
- `.disconnectedOverlay` — absolute inset, centered card with pulsing
  dot, backdrop blur
- `.connecting` — full-height centered spinner + text

Consult the mockup for exact values. Use `var(--wh-*)` tokens
everywhere.

**Step 2: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

Run: `pnpm biome check apps/kamp-us/src/wormhole/WormholeLayout.module.css`
Expected: PASS (or no CSS errors)

**Step 3: Commit**

```bash
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git commit -m "feat(wormhole): restyle panes, resize handles, overlays"
```

---

## Task 4: TerminalPane — SVG icons, focus glow, styled overlay

**Files:**
- Modify: `apps/kamp-us/src/wormhole/TerminalPane.tsx`

**Step 1: Replace text buttons with SVG icon buttons**

Replace the `|`, `—`, `×` text in the pane control buttons with
inline SVG elements matching the mockup:

- **Split Right:** Two side-by-side rectangles
  ```tsx
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="1.5" y="1.5" width="4.5" height="11" rx="0.5"/>
    <rect x="8" y="1.5" width="4.5" height="11" rx="0.5"/>
  </svg>
  ```

- **Split Down:** Two stacked rectangles
  ```tsx
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="1.5" y="1.5" width="11" height="4.5" rx="0.5"/>
    <rect x="1.5" y="8" width="11" height="4.5" rx="0.5"/>
  </svg>
  ```

- **Close:** X mark (add `className={styles.closeBtn}`)
  ```tsx
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="3.5" y1="3.5" x2="10.5" y2="10.5"/>
    <line x1="10.5" y1="3.5" x2="3.5" y2="10.5"/>
  </svg>
  ```

**Step 2: Restyle disconnected overlay**

Replace the plain text overlay with the card design from the mockup:

```tsx
{!connected && (
  <div className={styles.disconnectedOverlay}>
    <div className={styles.disconnectedCard}>
      <div className={styles.disconnectedDot} />
      <span className={styles.disconnectedTitle}>Disconnected</span>
      <span className={styles.disconnectedHint}>
        press any key to reconnect
      </span>
    </div>
  </div>
)}
```

**Step 3: Wrap terminal ref div with a className**

The `ref` div needs a class so CSS can target terminal content opacity:

```tsx
<div ref={ref} className={styles.terminalContent} />
```

Keep `style={{flex: 1, minHeight: 0}}` or move those to the CSS class.

**Step 4: Pass JetBrains Mono to the terminal canvas**

`useChannelTerminal` accepts `fontFamily` as an optional prop.
Pass it from TerminalPane so the terminal canvas matches the chrome:

```tsx
const {ref} = useChannelTerminal({
  channel,
  sessionId,
  fontFamily: "JetBrains Mono",
  theme,
});
```

**Step 5: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/kamp-us/src/wormhole/TerminalPane.tsx
git commit -m "feat(wormhole): SVG pane controls and styled overlay"
```

---

## Task 5: ChromeBar — unified session selector + tabs

**Files:**
- Create: `apps/kamp-us/src/wormhole/ChromeBar.tsx`
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

This is the most complex task. The ChromeBar merges SessionBar and
TabBar into one bar with three zones:

```
[SESSION ▾ | tab1  tab2  tab3  + |                    ●]
```

**Step 1: Create ChromeBar.tsx**

Use base-ui Menu directly (not the design system Menu wrapper, since
wormhole has its own styling):

```tsx
import {Menu} from "@base-ui/react/menu";
import {Tabs} from "@base-ui/react/tabs";
import {useMux} from "./MuxClient.tsx";
import styles from "./WormholeLayout.module.css";

export function ChromeBar() {
  const {
    state,
    createSession,
    destroySession,
    createTab,
    closeTab,
    switchTab,
  } = useMux();

  // Derive active session from active tab
  const activeTabRecord = state.tabs.find(
    (t) => t.id === state.activeTab,
  );
  const activeSessionId = activeTabRecord?.sessionId;
  const activeSession = state.sessions.find(
    (s) => s.id === activeSessionId,
  );

  // Tabs for the active session
  const visibleTabs = activeSessionId
    ? state.tabs.filter((t) => t.sessionId === activeSessionId)
    : [];

  return (
    <div className={styles.chromeBar}>
      {/* ── Session Selector (left zone) ── */}
      <div className={styles.sessionSelector}>
        <span className={styles.sessionLabel}>wormhole</span>
        <Menu.Root>
          <Menu.Trigger className={styles.sessionTrigger}>
            <span>{activeSession?.name ?? "—"}</span>
            <span className={styles.chevron} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              className={styles.sessionPositioner}
              side="bottom"
              align="start"
              sideOffset={1}
            >
              <Menu.Popup className={styles.sessionPopup}>
                {state.sessions.map((session) => {
                  const firstTab = state.tabs.find(
                    (t) => t.sessionId === session.id,
                  );
                  return (
                    <Menu.Item
                      key={session.id}
                      className={styles.sessionItem}
                      data-active={
                        session.id === activeSessionId || undefined
                      }
                      onClick={() => {
                        if (firstTab) switchTab(firstTab.id);
                      }}
                    >
                      <span>{session.name}</span>
                      <button
                        type="button"
                        className={styles.closeIcon}
                        aria-label={`Destroy ${session.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          destroySession(session.id);
                        }}
                      >
                        <CloseIconSvg />
                      </button>
                    </Menu.Item>
                  );
                })}
                <Menu.Separator className={styles.sessionDivider} />
                <Menu.Item
                  className={styles.sessionAction}
                  onClick={() =>
                    createSession(
                      `session-${state.sessions.length + 1}`,
                    )
                  }
                >
                  + New Session
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* ── Tab Bar (middle zone) ── */}
      {/* Tabs.Tab.Value is `any | null` — string IDs work.
          onValueChange receives (value, eventDetails). */}
      <Tabs.Root
        value={state.activeTab}
        onValueChange={(value) => switchTab(value as string)}
      >
        {/* Tabs.List renders a <div> and accepts any ReactNode
            children, so the + button can live inside it. */}
        <Tabs.List className={styles.tabList}>
          {visibleTabs.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              className={styles.tabItem}
            >
              <span>{tab.name}</span>
              <button
                type="button"
                className={styles.closeIcon}
                aria-label={`Close ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <CloseIconSvg />
              </button>
            </Tabs.Tab>
          ))}
          {activeSessionId && (
            <button
              type="button"
              className={styles.tabAdd}
              onClick={() =>
                createTab(
                  activeSessionId,
                  `tab-${visibleTabs.length + 1}`,
                )
              }
              aria-label="New tab"
            >
              +
            </button>
          )}
        </Tabs.List>
      </Tabs.Root>

      {/* ── Status Dot (right zone) ── */}
      <div className={styles.chromeStatus}>
        <div
          className={styles.statusDot}
          title={state.connected ? "Connected" : "Disconnected"}
          data-disconnected={!state.connected || undefined}
        />
      </div>
    </div>
  );
}

function CloseIconSvg() {
  return (
    <svg
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="1" y1="1" x2="7" y2="7" />
      <line x1="7" y1="1" x2="1" y2="7" />
    </svg>
  );
}
```

**Step 2: Add ChromeBar styles to WormholeLayout.module.css**

Add all chrome bar classes. Key patterns from the mockup:

- `.chromeBar` — flex, stretch, 34px height, surface bg, bottom border
- `.sessionSelector` — flex, right border separator
- `.sessionLabel` — 10px uppercase muted text
- `.sessionTrigger` — 12px, no border/bg, hover bg
- `.chevron` — CSS triangle (border trick)
- `.sessionPositioner` — z-index 100
- `.sessionPopup` — elevated bg, border, shadow, scale+opacity
  transition using `[data-starting-style]`/`[data-ending-style]`
- `.sessionItem` — flex between, hover bg, `[data-active]::before`
  accent dot
- `.sessionItem .closeIcon` — opacity 0, visible on item hover
- `.sessionDivider` — 1px border line
- `.sessionAction` — muted, smaller text
- `.tabList` — flex stretch, flex 1
- `.tabItem` — 11px, muted text, `[data-active]` gets bg-base +
  border-bottom matching bg-base + margin-bottom -1px
  (the background-blend pattern)
- `.tabItem .closeIcon` — opacity 0 until tab hover
- `.tabAdd` — muted +, hover secondary
- `.chromeStatus` — margin-left auto, flex center
- `.statusDot` — 5px circle, accent bg + glow shadow,
  `[data-disconnected]` danger + pulse animation
- `.closeIcon` — shared: 14px square, muted color, danger on hover

Note on base-ui data attributes (from https://base-ui.com/llms.txt):
- Tabs uses `[data-active]` for the active tab
- Menu uses `[data-highlighted]` for keyboard/hover focus
- Menu uses `[data-popup-open]` on the trigger when popup is visible
- Menu uses `[data-starting-style]`/`[data-ending-style]` for
  enter/exit animations
- CSS variable `--transform-origin` available on Menu.Popup for
  scale animations

**Step 3: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/kamp-us/src/wormhole/ChromeBar.tsx
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git commit -m "feat(wormhole): ChromeBar with session dropdown and tabs"
```

---

## Task 6: Wire up MuxClient and add connecting state

**Files:**
- Modify: `apps/kamp-us/src/wormhole/MuxClient.tsx`

**Step 1: Replace SessionBar + TabBar with ChromeBar**

```tsx
import {ChromeBar} from "./ChromeBar.tsx";
// Remove: import {SessionBar} from "./SessionBar.tsx";
// Remove: import {TabBar} from "./TabBar.tsx";
```

Update the render:

```tsx
return (
  <MuxContext.Provider value={client}>
    <div className={styles.container} data-wormhole>
      <ChromeBar />
      <PaneLayout />
    </div>
  </MuxContext.Provider>
);
```

Note: `data-wormhole` activates the design tokens from
`wormhole-tokens.css`.

**Step 2: Style the connecting state**

Replace the plain text with a styled spinner:

```tsx
if (!client.state.connected) {
  return (
    <div className={styles.container} data-wormhole>
      <div className={styles.connecting}>
        <div className={styles.connectingSpinner} />
        <span className={styles.connectingText}>Connecting...</span>
      </div>
    </div>
  );
}
```

Add to CSS:

```css
.connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
}

.connectingSpinner {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--wh-border);
  border-top-color: var(--wh-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.connectingText {
  font-size: 12px;
  color: var(--wh-text-muted);
  letter-spacing: 0.04em;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Step 3: Verify**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/kamp-us/src/wormhole/MuxClient.tsx
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git commit -m "feat(wormhole): wire ChromeBar and styled connecting state"
```

---

## Task 7: Delete old components and verify

**Files:**
- Delete: `apps/kamp-us/src/wormhole/SessionBar.tsx`
- Delete: `apps/kamp-us/src/wormhole/TabBar.tsx`

**Step 1: Delete the files**

```bash
rm apps/kamp-us/src/wormhole/SessionBar.tsx
rm apps/kamp-us/src/wormhole/TabBar.tsx
```

**Step 2: Verify no remaining imports**

Search for any references to the deleted files:

```bash
grep -r "SessionBar\|TabBar" apps/kamp-us/src/
```

Expected: No results (MuxClient no longer imports them).

**Step 3: Full verification**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

Run: `pnpm biome check apps/kamp-us/src/wormhole/`
Expected: PASS

**Step 4: Commit**

```bash
git add -u apps/kamp-us/src/wormhole/
git commit -m "refactor(wormhole): delete SessionBar and TabBar"
```

---

## Task 8: Custom scrollbars and selection highlight

**Files:**
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

**Step 1: Add scoped scrollbar styles**

Inside the `[data-wormhole]` scope in `wormhole-tokens.css`, or in
the CSS module targeting `.container`:

```css
.container ::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.container ::-webkit-scrollbar-track {
  background: transparent;
}

.container ::-webkit-scrollbar-thumb {
  background: #2a2a2a;
  border-radius: 3px;
}

.container ::-webkit-scrollbar-thumb:hover {
  background: #3a3a3a;
}

.container ::selection {
  background: rgba(201, 162, 77, 0.25);
  color: var(--wh-text-bright);
}
```

**Step 2: Verify + Commit**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

```bash
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git commit -m "feat(wormhole): custom scrollbars and selection highlight"
```

---

## Task 9: Page load animations

**Files:**
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

**Step 1: Add staggered entry animations**

```css
.chromeBar {
  animation: fadeDown 0.3s ease both;
  animation-delay: 0.1s;
}

/* Target the pane area wrapper in PaneLayout */
.paneArea {
  animation: fadeUp 0.4s ease both;
  animation-delay: 0.2s;
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

The `paneArea` class needs to be applied in PaneLayout.tsx to the
outer wrapper div.

**Step 2: Add paneArea class to PaneLayout**

In `PaneLayout.tsx`, change the outer div:

```tsx
<div className={styles.paneArea} style={{flex: 1, position: "relative"}}>
```

Or move flex/position into the CSS class itself.

**Step 3: Verify + Commit**

Run: `turbo run typecheck --filter=@kampus/kamp-us`
Expected: PASS

```bash
git add apps/kamp-us/src/wormhole/WormholeLayout.module.css
git add apps/kamp-us/src/wormhole/PaneLayout.tsx
git commit -m "feat(wormhole): staggered page load animations"
```

---

## Task 10: Visual verification

**Step 1: Start dev server**

```bash
pnpm turbo run dev --filter=@kampus/kamp-us
```

**Step 2: Manual checks**

Open the wormhole page in the browser and verify:

- [ ] JetBrains Mono renders for all chrome text
- [ ] Unified chrome bar: session dropdown on left, tabs in middle,
      status dot on right
- [ ] Session dropdown opens/closes, switches sessions, shows active
      dot, has close buttons
- [ ] Background-blend tab pattern: active tab bg matches terminal area
- [ ] Close buttons appear on tab hover
- [ ] Pane focus: accent outline + subtle glow on focused pane
- [ ] Unfocused panes: dimmed terminal content (opacity 0.55)
- [ ] Pane controls: appear on hover, SVG icons, backdrop blur
- [ ] Close button hover: danger red
- [ ] Resize handles: accent color on hover, grab dots appear
- [ ] Disconnected overlay: pulsing dot, centered card
- [ ] Connecting state: spinner + text
- [ ] Custom scrollbars
- [ ] Page load: staggered fade-down/fade-up animation

**Step 3: Fix any visual issues**

Iterate on CSS values if anything doesn't match the mockup.

**Step 4: Final commit if adjustments were needed**

```bash
git add -u apps/kamp-us/src/wormhole/
git commit -m "fix(wormhole): visual polish adjustments"
```

---

## Resolved Questions

1. **base-ui Tabs `onValueChange`:** Signature is
   `(value: Tabs.Tab.Value, eventDetails)` where `Value = any | null`.
   String tab IDs work. We ignore `eventDetails`.
2. **`+ New tab` button:** Goes inside `Tabs.List`. The List renders
   a `<div>` and accepts any `ReactNode` children (confirmed from
   type definitions: `BaseUIComponentProps<'div', ...>`).
3. **Ghostty terminal font:** `useChannelTerminal` accepts `fontFamily`
   prop (optional). We pass `"JetBrains Mono"` from TerminalPane (Task 4).
