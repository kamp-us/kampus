# Wormhole UI Redesign — Fix Pass

> **For Claude:** Read the mockup at
> `docs/mockups/terminal-refined-industrial.html` and compare against
> the current implementation. Use the frontend-design skill.

**Goal:** Fix visual issues from the initial UI redesign implementation
on branch `umut/wormhole-ui-redesign`.

**Context:** The redesign landed in 6 commits but has issues:
1. Terminal text garbles after split operations
2. Colors/background may not match mockup
3. Overall polish gap

---

## Bug 1: Garbled terminal text after pane split

**Symptom:** After splitting a pane, the terminal text in the
existing (resized) pane becomes garbled/corrupted.

**Likely cause:** The pane agent changed the terminal container from
inline styles to a CSS class:

```tsx
// BEFORE (worked):
<div ref={ref} style={{flex: 1, minHeight: 0}} />

// AFTER (garbles on split):
<div ref={ref} className={styles.terminalContent} />
```

The `.terminalContent` CSS class is:
```css
.terminalContent {
  flex: 1;
  min-height: 0;
  transition: opacity 0.2s ease;
}
```

Possible issues:
1. The `transition: opacity 0.2s ease` might interfere with
   ghostty-web's layout measurement during resize
2. The class might be missing `width: 100%` or `height: 100%`
   that the flex layout needs explicitly for canvas sizing
3. The opacity transition on the parent might cause ghostty-web
   to mis-measure during the split animation

**Investigation steps:**
1. Check if removing `transition` from `.terminalContent` fixes it
2. Check if adding explicit `width: 100%; height: 100%` fixes it
3. Check if the bug exists on `main` branch (pre-redesign) too
4. Check ghostty-web's resize observer — does it fire correctly
   when the flex container resizes from a split?

**Fix approach:** Move the opacity transition to a wrapper div
instead of the terminal container. The `ref` div that ghostty-web
attaches to should have zero CSS interference:

```tsx
<div className={styles.terminalContent}>
  <div ref={ref} style={{width: "100%", height: "100%"}} />
</div>
```

Or keep inline styles on the ref div and use the class only for
the opacity effect on a wrapper.

---

## Bug 2: Background/color mismatch

**Symptom:** Page background may not be #0e0e0e from tokens.

**Investigation steps:**
1. Open DevTools, inspect `[data-wormhole]` — are the CSS custom
   properties actually set?
2. Check if `@import "./wormhole-tokens.css"` inside the CSS module
   is being processed correctly by Vite
3. Check if body/html styles from `index.css` or radix colors are
   bleeding through

**Possible fix:** If the import isn't working, move the
`[data-wormhole]` styles into the module CSS directly, or import
the tokens file from a global CSS file instead.

**Alternative:** Set explicit `background: var(--wh-bg-base)` on
`.container` as a fallback.

---

## Bug 3: Visual polish pass

**Approach:** Open the mockup HTML and the running app side by side.
Compare element by element:

- [ ] Chrome bar height, padding, background color
- [ ] Session label font size, weight, letter-spacing, color
- [ ] Session trigger hover state
- [ ] Tab item: inactive color, active background-blend pattern
- [ ] Tab close button visibility on hover
- [ ] Status dot color and glow
- [ ] Pane focus: amber outline + subtle glow visible?
- [ ] Unfocused pane dimming (opacity 0.55)
- [ ] Pane controls: backdrop blur, SVG icon sizes
- [ ] Resize handle: accent on hover, grab dots
- [ ] Disconnected overlay: blur, pulsing dot
- [ ] Connecting spinner
- [ ] Page load animations
- [ ] Custom scrollbars
- [ ] JetBrains Mono rendering in chrome text

Fix any mismatches found. The mockup HTML is the source of truth.

---

## Files to check

| File | What to look at |
|------|-----------------|
| `apps/kamp-us/src/wormhole/wormhole-tokens.css` | Token values match mockup |
| `apps/kamp-us/src/wormhole/WormholeLayout.module.css` | All styles match mockup |
| `apps/kamp-us/src/wormhole/TerminalPane.tsx` | Terminal ref div setup |
| `apps/kamp-us/src/wormhole/ChromeBar.tsx` | Component structure |
| `apps/kamp-us/src/wormhole/MuxClient.tsx` | data-wormhole attribute |
| `apps/kamp-us/src/wormhole/PaneLayout.tsx` | paneArea class |
| `apps/kamp-us/src/index.css` | Body styles that might conflict |
| `docs/mockups/terminal-refined-industrial.html` | Source of truth |
