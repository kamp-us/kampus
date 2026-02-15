# Wormhole Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `@kampus/sandbox` as a thin tmux-like mux server over CF Sandbox's terminal API.

**Architecture:** WormholeServer DO manages session metadata + tabs + pane layout + channel multiplexing. CF Sandbox handles all terminal compute, buffering, and reconnection. Frontend is a dumb renderer — sends intents, receives state. See `docs/plans/2026-02-14-mux-server-design.md` for full design.

**Tech Stack:** Plain TypeScript, Effect Schema (encode/decode only), `@usirin/layout-tree` (pane layout), CF Workers API (DO, WS hibernation, storage), `@kampus/ghostty-react` (frontend terminal).

---

### Task 1: Set up package structure and dependencies

**Files:**
- Modify: `packages/sandbox/package.json`
- Delete: `packages/sandbox/src/RingBuffer.ts`
- Delete: `packages/sandbox/src/ManagedSession.ts`
- Delete: `packages/sandbox/src/ManagedSessionStore.ts`
- Delete: `packages/sandbox/src/MuxHandler.ts`
- Delete: `packages/sandbox/src/SessionCheckpoint.ts`
- Delete: `packages/sandbox/src/internal/managedSession.ts`
- Delete: `packages/sandbox/src/internal/managedSessionStore.ts`
- Delete: `packages/sandbox/src/internal/muxHandler.ts`
- Modify: `packages/sandbox/src/index.ts`

**Step 1: Add `@usirin/layout-tree` dependency to sandbox package**

```json
// packages/sandbox/package.json — add to dependencies
"@usirin/layout-tree": "catalog:"
```

Run: `pnpm install`

**Step 2: Delete files that are being replaced**

Delete these files (all replaced by Wormhole protocol):
- `packages/sandbox/src/RingBuffer.ts` — CF handles buffering
- `packages/sandbox/src/ManagedSession.ts` — replaced by thin WS bridge
- `packages/sandbox/src/ManagedSessionStore.ts` — replaced by WormholeServer state
- `packages/sandbox/src/MuxHandler.ts` — replaced by WormholeHandler
- `packages/sandbox/src/SessionCheckpoint.ts` — no terminal state checkpointing
- `packages/sandbox/src/internal/managedSession.ts`
- `packages/sandbox/src/internal/managedSessionStore.ts`
- `packages/sandbox/src/internal/muxHandler.ts`

Keep:
- `packages/sandbox/src/Sandbox.ts` — CF Sandbox binding tag
- `packages/sandbox/src/Errors.ts` — will be updated
- `packages/sandbox/src/Protocol.ts` — will be rewritten
- `packages/sandbox/src/internal/channelMap.ts` — will be rewritten

**Step 3: Update barrel export**

```typescript
// packages/sandbox/src/index.ts
export * as Errors from "./Errors.ts";
export * as Protocol from "./Protocol.ts";
export * as ChannelMap from "./ChannelMap.ts";
export * as TabbedLayout from "./TabbedLayout.ts";
export * as Sandbox from "./Sandbox.ts";
```

**Step 4: Verify typecheck passes (it won't yet — that's OK)**

Run: `turbo run typecheck --filter=@kampus/sandbox`
Expected: Errors for missing modules (TabbedLayout, rewritten files). This confirms cleanup is done.

**Step 5: Commit**

```bash
git add -A packages/sandbox/
git commit -m "refactor(sandbox): remove old session/buffer code, prep for Wormhole protocol"
```

---

### Task 2: Protocol types (Effect Schema)

**Files:**
- Rewrite: `packages/sandbox/src/Protocol.ts`
- Create: `packages/sandbox/test/Protocol.test.ts`

**Step 1: Write failing tests for protocol encode/decode**

```typescript
// packages/sandbox/test/Protocol.test.ts
import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import {
  ClientMessage,
  ServerMessage,
  encodeBinaryFrame,
  parseBinaryFrame,
  CONTROL_CHANNEL,
} from "../src/Protocol.ts";

describe("Protocol", () => {
  describe("ClientMessage", () => {
    it("decodes connect message", () => {
      const raw = { type: "connect", width: 1200, height: 800 };
      const result = S.decodeUnknownSync(ClientMessage)(raw);
      expect(result.type).toBe("connect");
      expect(result.width).toBe(1200);
    });

    it("decodes pane_split message", () => {
      const raw = { type: "pane_split", orientation: "horizontal", cols: 80, rows: 24 };
      const result = S.decodeUnknownSync(ClientMessage)(raw);
      expect(result.type).toBe("pane_split");
    });

    it("decodes session_create message", () => {
      const raw = { type: "session_create", name: "dev" };
      const result = S.decodeUnknownSync(ClientMessage)(raw);
      expect(result.type).toBe("session_create");
      expect(result.name).toBe("dev");
    });

    it("decodes pane_resize message with explicit paneId", () => {
      const raw = { type: "pane_resize", paneId: "win-abc", cols: 120, rows: 40 };
      const result = S.decodeUnknownSync(ClientMessage)(raw);
      expect(result.type).toBe("pane_resize");
      expect(result.paneId).toBe("win-abc");
    });

    it("rejects unknown message type", () => {
      const raw = { type: "bogus" };
      expect(() => S.decodeUnknownSync(ClientMessage)(raw)).toThrow();
    });
  });

  describe("ServerMessage", () => {
    it("decodes state message", () => {
      const raw = {
        type: "state",
        sessions: [],
        tabs: [],
        activeTab: null,
        channels: {},
      };
      const result = S.decodeUnknownSync(ServerMessage)(raw);
      expect(result.type).toBe("state");
    });

    it("decodes session_exit message", () => {
      const raw = {
        type: "session_exit",
        sessionId: "s1",
        ptyId: "pty-1",
        channel: 0,
        exitCode: 0,
      };
      const result = S.decodeUnknownSync(ServerMessage)(raw);
      expect(result.type).toBe("session_exit");
    });
  });

  describe("Binary framing", () => {
    it("roundtrips binary frame", () => {
      const payload = new TextEncoder().encode("hello");
      const frame = encodeBinaryFrame(3, payload);
      const parsed = parseBinaryFrame(frame);
      expect(parsed.channel).toBe(3);
      expect(new TextDecoder().decode(parsed.payload)).toBe("hello");
    });

    it("encodes control channel as 255", () => {
      const payload = new TextEncoder().encode("{}");
      const frame = encodeBinaryFrame(CONTROL_CHANNEL, payload);
      expect(frame[0]).toBe(255);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/Protocol.test.ts`
Expected: FAIL — module not found or missing exports

**Step 3: Write Protocol.ts implementation**

```typescript
// packages/sandbox/src/Protocol.ts
import * as S from "effect/Schema";

// --- Constants ---

export const CONTROL_CHANNEL = 255;

// --- Binary framing ---

export function encodeBinaryFrame(channel: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.byteLength);
  frame[0] = channel;
  frame.set(payload, 1);
  return frame;
}

export function parseBinaryFrame(frame: Uint8Array): { channel: number; payload: Uint8Array } {
  return {
    channel: frame[0],
    payload: frame.subarray(1),
  };
}

// --- Client → Server messages ---

export class ConnectMessage extends S.Class<ConnectMessage>("ConnectMessage")({
  type: S.Literal("connect"),
  width: S.Number,
  height: S.Number,
}) {}

export class SessionCreateMessage extends S.Class<SessionCreateMessage>("SessionCreateMessage")({
  type: S.Literal("session_create"),
  name: S.String,
}) {}

export class SessionDestroyMessage extends S.Class<SessionDestroyMessage>("SessionDestroyMessage")({
  type: S.Literal("session_destroy"),
  sessionId: S.String,
}) {}

export class SessionRenameMessage extends S.Class<SessionRenameMessage>("SessionRenameMessage")({
  type: S.Literal("session_rename"),
  sessionId: S.String,
  name: S.String,
}) {}

export class TabCreateMessage extends S.Class<TabCreateMessage>("TabCreateMessage")({
  type: S.Literal("tab_create"),
  sessionId: S.String,
  name: S.String,
}) {}

export class TabCloseMessage extends S.Class<TabCloseMessage>("TabCloseMessage")({
  type: S.Literal("tab_close"),
  tabId: S.String,
}) {}

export class TabRenameMessage extends S.Class<TabRenameMessage>("TabRenameMessage")({
  type: S.Literal("tab_rename"),
  tabId: S.String,
  name: S.String,
}) {}

export class TabSwitchMessage extends S.Class<TabSwitchMessage>("TabSwitchMessage")({
  type: S.Literal("tab_switch"),
  tabId: S.String,
}) {}

export class PaneSplitMessage extends S.Class<PaneSplitMessage>("PaneSplitMessage")({
  type: S.Literal("pane_split"),
  orientation: S.Union(S.Literal("horizontal"), S.Literal("vertical")),
  cols: S.Number,
  rows: S.Number,
}) {}

export class PaneCloseMessage extends S.Class<PaneCloseMessage>("PaneCloseMessage")({
  type: S.Literal("pane_close"),
  paneId: S.String,
}) {}

export class PaneResizeMessage extends S.Class<PaneResizeMessage>("PaneResizeMessage")({
  type: S.Literal("pane_resize"),
  paneId: S.String,
  cols: S.Number,
  rows: S.Number,
}) {}

export class PaneFocusMessage extends S.Class<PaneFocusMessage>("PaneFocusMessage")({
  type: S.Literal("pane_focus"),
  direction: S.Union(
    S.Literal("left"),
    S.Literal("right"),
    S.Literal("up"),
    S.Literal("down"),
  ),
}) {}

export const ClientMessage = S.Union(
  ConnectMessage,
  SessionCreateMessage,
  SessionDestroyMessage,
  SessionRenameMessage,
  TabCreateMessage,
  TabCloseMessage,
  TabRenameMessage,
  TabSwitchMessage,
  PaneSplitMessage,
  PaneCloseMessage,
  PaneResizeMessage,
  PaneFocusMessage,
);
export type ClientMessage = S.Schema.Type<typeof ClientMessage>;

// --- Server → Client messages ---

export const SessionRecord = S.Struct({
  id: S.String,
  sandboxId: S.String,
  name: S.String,
  createdAt: S.Number,
});

export const TabRecord = S.Struct({
  id: S.String,
  sessionId: S.String,
  name: S.String,
  layout: S.Unknown, // serialized layout-tree Tree
  focus: S.Array(S.Number), // StackPath
});

export class StateMessage extends S.Class<StateMessage>("StateMessage")({
  type: S.Literal("state"),
  sessions: S.Array(SessionRecord),
  tabs: S.Array(TabRecord),
  activeTab: S.NullOr(S.String),
  channels: S.Record({ key: S.String, value: S.Number }), // ptyId → channel
}) {}

export class LayoutUpdateMessage extends S.Class<LayoutUpdateMessage>("LayoutUpdateMessage")({
  type: S.Literal("layout_update"),
  tabs: S.Array(TabRecord),
  activeTab: S.NullOr(S.String),
  channels: S.Record({ key: S.String, value: S.Number }),
}) {}

export class SessionExitMessage extends S.Class<SessionExitMessage>("SessionExitMessage")({
  type: S.Literal("session_exit"),
  sessionId: S.String,
  ptyId: S.String,
  channel: S.Number,
  exitCode: S.Number,
}) {}

export class SessionsResetMessage extends S.Class<SessionsResetMessage>("SessionsResetMessage")({
  type: S.Literal("sessions_reset"),
  sessionId: S.String,
}) {}

export const ServerMessage = S.Union(
  StateMessage,
  LayoutUpdateMessage,
  SessionExitMessage,
  SessionsResetMessage,
);
export type ServerMessage = S.Schema.Type<typeof ServerMessage>;

// --- Helpers ---

export function encodeControlMessage(msg: ServerMessage): Uint8Array {
  const json = JSON.stringify(msg);
  const payload = new TextEncoder().encode(json);
  return encodeBinaryFrame(CONTROL_CHANNEL, payload);
}

export function decodeControlMessage(payload: Uint8Array): ClientMessage {
  const json = JSON.parse(new TextDecoder().decode(payload));
  return S.decodeUnknownSync(ClientMessage)(json);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/Protocol.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sandbox/src/Protocol.ts packages/sandbox/test/Protocol.test.ts
git commit -m "feat(sandbox): Wormhole protocol types with Effect Schema"
```

---

### Task 3: TabbedLayout — tab + focus wrapper

**Files:**
- Create: `packages/sandbox/src/TabbedLayout.ts`
- Create: `packages/sandbox/test/TabbedLayout.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/sandbox/test/TabbedLayout.test.ts
import { describe, it, expect } from "vitest";
import {
  createTabbedLayout,
  createTab,
  closeTab,
  switchTab,
  renameTab,
  splitPane,
  closePane,
  moveFocus,
  getActiveTab,
  getFocusedWindow,
  allWindowKeys,
} from "../src/TabbedLayout.ts";

describe("TabbedLayout", () => {
  describe("createTabbedLayout", () => {
    it("creates layout with one tab and one pane", () => {
      const layout = createTabbedLayout("main", "pty-1");
      expect(layout.tabs).toHaveLength(1);
      expect(layout.tabs[0].name).toBe("main");
      expect(layout.activeTab).toBe(0);
      const focused = getFocusedWindow(layout);
      expect(focused?.key).toBe("pty-1");
    });
  });

  describe("createTab", () => {
    it("adds a new tab and switches to it", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const updated = createTab(layout, "tests", "pty-2");
      expect(updated.tabs).toHaveLength(2);
      expect(updated.activeTab).toBe(1);
      expect(updated.tabs[1].name).toBe("tests");
    });
  });

  describe("closeTab", () => {
    it("removes tab and adjusts activeTab", () => {
      let layout = createTabbedLayout("main", "pty-1");
      layout = createTab(layout, "tests", "pty-2");
      const updated = closeTab(layout, 1);
      expect(updated.tabs).toHaveLength(1);
      expect(updated.activeTab).toBe(0);
    });

    it("returns null when closing last tab", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const updated = closeTab(layout, 0);
      expect(updated).toBeNull();
    });
  });

  describe("switchTab", () => {
    it("changes active tab", () => {
      let layout = createTabbedLayout("main", "pty-1");
      layout = createTab(layout, "tests", "pty-2");
      const updated = switchTab(layout, 0);
      expect(updated.activeTab).toBe(0);
    });
  });

  describe("renameTab", () => {
    it("updates tab name", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const updated = renameTab(layout, 0, "renamed");
      expect(updated.tabs[0].name).toBe("renamed");
    });
  });

  describe("splitPane", () => {
    it("splits focused pane and returns new window key path", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: updated, newPath } = splitPane(layout, "horizontal", "pty-2");
      const keys = allWindowKeys(updated);
      expect(keys).toContain("pty-1");
      expect(keys).toContain("pty-2");
      expect(newPath).toBeDefined();
    });

    it("moves focus to the new pane", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: updated } = splitPane(layout, "horizontal", "pty-2");
      const focused = getFocusedWindow(updated);
      expect(focused?.key).toBe("pty-2");
    });
  });

  describe("closePane", () => {
    it("removes pane and updates focus", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: split } = splitPane(layout, "horizontal", "pty-2");
      // close the focused pane (pty-2)
      const focused = getFocusedWindow(split);
      const updated = closePane(split, split.tabs[split.activeTab].focus);
      expect(updated).not.toBeNull();
      const keys = allWindowKeys(updated!);
      expect(keys).not.toContain(focused?.key);
    });
  });

  describe("moveFocus", () => {
    it("moves focus to sibling", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: split } = splitPane(layout, "horizontal", "pty-2");
      // focus is on pty-2 (right), move left
      const updated = moveFocus(split, "left");
      const focused = getFocusedWindow(updated);
      expect(focused?.key).toBe("pty-1");
    });

    it("stays put when no sibling in direction", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const updated = moveFocus(layout, "left");
      const focused = getFocusedWindow(updated);
      expect(focused?.key).toBe("pty-1");
    });
  });

  describe("per-tab focus", () => {
    it("each tab remembers its own focus", () => {
      let layout = createTabbedLayout("tab1", "pty-1");
      const { layout: split } = splitPane(layout, "horizontal", "pty-2");
      // tab1 focus is on pty-2
      layout = createTab(split, "tab2", "pty-3");
      // tab2 focus is on pty-3
      // switch back to tab1
      layout = switchTab(layout, 0);
      const focused = getFocusedWindow(layout);
      expect(focused?.key).toBe("pty-2");
    });
  });

  describe("allWindowKeys", () => {
    it("returns all pty keys across all tabs", () => {
      let layout = createTabbedLayout("tab1", "pty-1");
      const { layout: split } = splitPane(layout, "horizontal", "pty-2");
      layout = createTab(split, "tab2", "pty-3");
      const keys = allWindowKeys(layout);
      expect(keys).toEqual(expect.arrayContaining(["pty-1", "pty-2", "pty-3"]));
      expect(keys).toHaveLength(3);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/TabbedLayout.test.ts`
Expected: FAIL — module not found

**Step 3: Write TabbedLayout implementation**

```typescript
// packages/sandbox/src/TabbedLayout.ts
import * as LT from "@usirin/layout-tree";

// --- Types ---

export interface Tab {
  id: string;
  name: string;
  tree: LT.Tree;
  focus: LT.StackPath;
}

export interface TabbedLayout {
  tabs: Tab[];
  activeTab: number;
}

// --- Helpers ---

let _tabCounter = 0;
function nextTabId(): string {
  return `tab-${++_tabCounter}`;
}

export function getActiveTab(layout: TabbedLayout): Tab {
  return layout.tabs[layout.activeTab];
}

export function getFocusedWindow(layout: TabbedLayout): LT.Window | null {
  const tab = getActiveTab(layout);
  const node = LT.getAt(tab.tree.root, tab.focus);
  if (node && node.type === "window") return node;
  return null;
}

export function allWindowKeys(layout: TabbedLayout): string[] {
  const keys: string[] = [];
  function walk(node: LT.Window | LT.Stack) {
    if (node.type === "window") {
      keys.push(node.key);
    } else {
      node.children.forEach(walk);
    }
  }
  for (const tab of layout.tabs) {
    walk(tab.tree.root);
  }
  return keys;
}

// --- Tab operations ---

export function createTabbedLayout(tabName: string, windowKey: string): TabbedLayout {
  const window = LT.createWindow(windowKey);
  const tree = LT.createTree(LT.createStack("vertical", [window]));
  return {
    tabs: [{ id: nextTabId(), name: tabName, tree, focus: [0] }],
    activeTab: 0,
  };
}

export function createTab(layout: TabbedLayout, name: string, windowKey: string): TabbedLayout {
  const window = LT.createWindow(windowKey);
  const tree = LT.createTree(LT.createStack("vertical", [window]));
  const newTab: Tab = { id: nextTabId(), name, tree, focus: [0] };
  return {
    tabs: [...layout.tabs, newTab],
    activeTab: layout.tabs.length,
  };
}

export function closeTab(layout: TabbedLayout, tabIndex: number): TabbedLayout | null {
  if (layout.tabs.length <= 1) return null;
  const tabs = layout.tabs.filter((_, i) => i !== tabIndex);
  let activeTab = layout.activeTab;
  if (activeTab >= tabs.length) activeTab = tabs.length - 1;
  if (activeTab > tabIndex) activeTab--;
  return { tabs, activeTab };
}

export function switchTab(layout: TabbedLayout, tabIndex: number): TabbedLayout {
  return { ...layout, activeTab: tabIndex };
}

export function renameTab(layout: TabbedLayout, tabIndex: number, name: string): TabbedLayout {
  const tabs = layout.tabs.map((tab, i) =>
    i === tabIndex ? { ...tab, name } : tab,
  );
  return { ...layout, tabs };
}

// --- Pane operations (scoped to active tab) ---

export function splitPane(
  layout: TabbedLayout,
  orientation: LT.Orientation,
  newWindowKey: string,
): { layout: TabbedLayout; newPath: LT.StackPath } {
  const tab = getActiveTab(layout);
  const newTree = LT.split(tab.tree, tab.focus, orientation);

  // After split, the new pane is the sibling after the current focus
  const newPath: LT.StackPath = [
    ...tab.focus.slice(0, -1),
    tab.focus[tab.focus.length - 1] + 1,
  ];

  // Update the new window's key
  const updatedTree = LT.updateWindow(newTree, newPath, newWindowKey);

  const updatedTab: Tab = { ...tab, tree: updatedTree, focus: newPath };
  const tabs = layout.tabs.map((t, i) =>
    i === layout.activeTab ? updatedTab : t,
  );
  return { layout: { ...layout, tabs }, newPath };
}

export function closePane(
  layout: TabbedLayout,
  path: LT.StackPath,
): TabbedLayout | null {
  const tab = getActiveTab(layout);
  const newTree = LT.remove(tab.tree, path);

  // If tree is empty (removed last pane), return null
  if (newTree.root.children.length === 0) return null;

  // Move focus to nearest sibling or parent's first child
  let newFocus: LT.StackPath;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = LT.getAt(newTree.root, parentPath);
  if (parent && parent.type === "stack" && parent.children.length > 0) {
    const newIdx = Math.min(idx, parent.children.length - 1);
    newFocus = [...parentPath, newIdx];
    // Descend to first window if we landed on a stack
    let node = LT.getAt(newTree.root, newFocus);
    while (node && node.type === "stack" && node.children.length > 0) {
      newFocus = [...newFocus, 0];
      node = LT.getAt(newTree.root, newFocus);
    }
  } else {
    newFocus = [0];
  }

  const updatedTab: Tab = { ...tab, tree: newTree, focus: newFocus };
  const tabs = layout.tabs.map((t, i) =>
    i === layout.activeTab ? updatedTab : t,
  );
  return { ...layout, tabs };
}

export function moveFocus(
  layout: TabbedLayout,
  direction: LT.Direction,
): TabbedLayout {
  const tab = getActiveTab(layout);
  const sibling = LT.findSibling(tab.tree, tab.focus, direction);
  if (!sibling) return layout;

  const siblingPath = LT.findWindowPath(tab.tree, sibling);
  if (!siblingPath) return layout;

  const updatedTab: Tab = { ...tab, focus: siblingPath };
  const tabs = layout.tabs.map((t, i) =>
    i === layout.activeTab ? updatedTab : t,
  );
  return { ...layout, tabs };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/TabbedLayout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sandbox/src/TabbedLayout.ts packages/sandbox/test/TabbedLayout.test.ts
git commit -m "feat(sandbox): TabbedLayout — tab + focus wrapper over layout-tree"
```

---

### Task 4: ChannelMap — plain TS rewrite

**Files:**
- Rewrite: `packages/sandbox/src/ChannelMap.ts` (move from `internal/channelMap.ts`)
- Create: `packages/sandbox/test/ChannelMap.test.ts`
- Delete: `packages/sandbox/src/internal/channelMap.ts`

**Step 1: Write failing tests**

```typescript
// packages/sandbox/test/ChannelMap.test.ts
import { describe, it, expect } from "vitest";
import { ChannelMap } from "../src/ChannelMap.ts";

describe("ChannelMap", () => {
  it("assigns sequential channels", () => {
    const map = new ChannelMap();
    expect(map.assign("pty-1")).toBe(0);
    expect(map.assign("pty-2")).toBe(1);
    expect(map.assign("pty-3")).toBe(2);
  });

  it("returns existing channel for same ptyId (idempotent)", () => {
    const map = new ChannelMap();
    const ch = map.assign("pty-1");
    expect(map.assign("pty-1")).toBe(ch);
  });

  it("recycles released channels", () => {
    const map = new ChannelMap();
    map.assign("pty-1"); // 0
    const ch1 = map.assign("pty-2"); // 1
    map.release(ch1);
    const ch2 = map.assign("pty-3");
    expect(ch2).toBe(1); // recycled
  });

  it("looks up by channel", () => {
    const map = new ChannelMap();
    map.assign("pty-1");
    expect(map.getPtyId(0)).toBe("pty-1");
    expect(map.getPtyId(99)).toBeNull();
  });

  it("looks up by ptyId", () => {
    const map = new ChannelMap();
    map.assign("pty-1");
    expect(map.getChannel("pty-1")).toBe(0);
    expect(map.getChannel("nonexistent")).toBeNull();
  });

  it("returns null when channels exhausted", () => {
    const map = new ChannelMap(3); // max 3 channels
    map.assign("a");
    map.assign("b");
    map.assign("c");
    expect(map.assign("d")).toBeNull();
  });

  it("serializes to a plain record", () => {
    const map = new ChannelMap();
    map.assign("pty-1");
    map.assign("pty-2");
    const record = map.toRecord();
    expect(record).toEqual({ "pty-1": 0, "pty-2": 1 });
  });

  it("restores from a record", () => {
    const map = ChannelMap.fromRecord({ "pty-1": 0, "pty-2": 3 });
    expect(map.getChannel("pty-1")).toBe(0);
    expect(map.getChannel("pty-2")).toBe(3);
    // next assign should not collide
    const ch = map.assign("pty-3");
    expect(ch).not.toBe(0);
    expect(ch).not.toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/ChannelMap.test.ts`
Expected: FAIL

**Step 3: Write ChannelMap implementation**

```typescript
// packages/sandbox/src/ChannelMap.ts
const DEFAULT_MAX_CHANNELS = 255; // 0-254, channel 255 reserved for control

export class ChannelMap {
  private channelToPty = new Map<number, string>();
  private ptyToChannel = new Map<string, number>();
  private freeList: number[] = [];
  private nextChannel = 0;
  private maxChannels: number;

  constructor(maxChannels: number = DEFAULT_MAX_CHANNELS) {
    this.maxChannels = maxChannels;
  }

  assign(ptyId: string): number | null {
    const existing = this.ptyToChannel.get(ptyId);
    if (existing !== undefined) return existing;

    let channel: number | undefined;
    if (this.freeList.length > 0) {
      channel = this.freeList.pop()!;
    } else if (this.nextChannel < this.maxChannels) {
      channel = this.nextChannel++;
    } else {
      return null;
    }

    this.channelToPty.set(channel, ptyId);
    this.ptyToChannel.set(ptyId, channel);
    return channel;
  }

  release(channel: number): void {
    const ptyId = this.channelToPty.get(channel);
    if (ptyId === undefined) return;
    this.channelToPty.delete(channel);
    this.ptyToChannel.delete(ptyId);
    this.freeList.push(channel);
  }

  getPtyId(channel: number): string | null {
    return this.channelToPty.get(channel) ?? null;
  }

  getChannel(ptyId: string): number | null {
    return this.ptyToChannel.get(ptyId) ?? null;
  }

  toRecord(): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [ptyId, channel] of this.ptyToChannel) {
      record[ptyId] = channel;
    }
    return record;
  }

  static fromRecord(record: Record<string, number>, maxChannels: number = DEFAULT_MAX_CHANNELS): ChannelMap {
    const map = new ChannelMap(maxChannels);
    let maxSeen = -1;
    for (const [ptyId, channel] of Object.entries(record)) {
      map.channelToPty.set(channel, ptyId);
      map.ptyToChannel.set(ptyId, channel);
      if (channel > maxSeen) maxSeen = channel;
    }
    map.nextChannel = maxSeen + 1;
    return map;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/ChannelMap.test.ts`
Expected: PASS

**Step 5: Delete old channelMap and commit**

```bash
rm packages/sandbox/src/internal/channelMap.ts
git add packages/sandbox/src/ChannelMap.ts packages/sandbox/test/ChannelMap.test.ts
git add packages/sandbox/src/internal/channelMap.ts
git commit -m "feat(sandbox): ChannelMap rewrite as plain TS"
```

---

### Task 5: Errors — simplify

**Files:**
- Modify: `packages/sandbox/src/Errors.ts`

**Step 1: Simplify error types for Wormhole protocol**

```typescript
// packages/sandbox/src/Errors.ts
export class ChannelExhaustedError extends Error {
  readonly _tag = "ChannelExhaustedError";
  constructor() {
    super("All channels are in use (max 254)");
  }
}

export class SandboxSleepError extends Error {
  readonly _tag = "SandboxSleepError";
  constructor(readonly sessionId: string) {
    super(`Sandbox for session ${sessionId} has gone to sleep`);
  }
}

export class SessionNotFoundError extends Error {
  readonly _tag = "SessionNotFoundError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}

export class TabNotFoundError extends Error {
  readonly _tag = "TabNotFoundError";
  constructor(readonly tabId: string) {
    super(`Tab ${tabId} not found`);
  }
}
```

**Step 2: Commit**

```bash
git add packages/sandbox/src/Errors.ts
git commit -m "refactor(sandbox): simplify errors for Wormhole protocol"
```

---

### Task 6: WormholeHandler — message routing + WS bridging

**Files:**
- Create: `packages/sandbox/src/WormholeHandler.ts`
- Create: `packages/sandbox/test/WormholeHandler.test.ts`

**Step 1: Write failing tests for message routing**

```typescript
// packages/sandbox/test/WormholeHandler.test.ts
import { describe, it, expect, vi } from "vitest";
import { WormholeHandler } from "../src/WormholeHandler.ts";
import { CONTROL_CHANNEL, encodeBinaryFrame } from "../src/Protocol.ts";

function makeTestHandler() {
  const sent: Uint8Array[] = [];
  const handler = new WormholeHandler({
    send: (data: Uint8Array) => { sent.push(data); },
    close: vi.fn(),
    getSandbox: vi.fn(),
    createTerminal: vi.fn(),
    destroyTerminal: vi.fn(),
  });
  return { handler, sent };
}

describe("WormholeHandler", () => {
  describe("binary frame routing", () => {
    it("routes terminal data to correct pty write callback", () => {
      const { handler } = makeTestHandler();
      const written: Uint8Array[] = [];
      handler._registerPty("pty-1", 0, {
        write: (data) => { written.push(data); },
        close: vi.fn(),
      });

      const frame = encodeBinaryFrame(0, new TextEncoder().encode("ls\n"));
      handler.handleMessage(frame);

      expect(written).toHaveLength(1);
      expect(new TextDecoder().decode(written[0])).toBe("ls\n");
    });

    it("ignores data for unassigned channels", () => {
      const { handler } = makeTestHandler();
      const frame = encodeBinaryFrame(5, new TextEncoder().encode("data"));
      // Should not throw
      handler.handleMessage(frame);
    });
  });

  describe("control message parsing", () => {
    it("parses control channel messages as JSON", () => {
      const { handler } = makeTestHandler();
      const handleControl = vi.spyOn(handler, "handleControlMessage");
      const msg = JSON.stringify({ type: "session_create", name: "dev" });
      const frame = encodeBinaryFrame(CONTROL_CHANNEL, new TextEncoder().encode(msg));
      handler.handleMessage(frame);
      expect(handleControl).toHaveBeenCalledWith(
        expect.objectContaining({ type: "session_create", name: "dev" }),
      );
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/WormholeHandler.test.ts`
Expected: FAIL

**Step 3: Write WormholeHandler implementation**

```typescript
// packages/sandbox/src/WormholeHandler.ts
import { ChannelMap } from "./ChannelMap.ts";
import {
  CONTROL_CHANNEL,
  parseBinaryFrame,
  encodeBinaryFrame,
  decodeControlMessage,
  encodeControlMessage,
  type ClientMessage,
  type ServerMessage,
} from "./Protocol.ts";

export interface PtyHandle {
  write: (data: Uint8Array) => void;
  close: () => void;
}

export interface WormholeHandlerDeps {
  send: (data: Uint8Array) => void;
  close: () => void;
  getSandbox: (sessionId: string) => unknown;
  createTerminal: (sessionId: string) => Promise<PtyHandle>;
  destroyTerminal: (sessionId: string, ptyId: string) => Promise<void>;
}

export class WormholeHandler {
  private channelMap = new ChannelMap();
  private ptyHandles = new Map<number, PtyHandle>(); // channel → handle
  private deps: WormholeHandlerDeps;

  constructor(deps: WormholeHandlerDeps) {
    this.deps = deps;
  }

  handleMessage(data: Uint8Array): void {
    const { channel, payload } = parseBinaryFrame(data);

    if (channel === CONTROL_CHANNEL) {
      const msg = decodeControlMessage(payload);
      this.handleControlMessage(msg);
      return;
    }

    // Route terminal data to PTY
    const handle = this.ptyHandles.get(channel);
    if (handle) {
      handle.write(payload);
    }
  }

  handleControlMessage(msg: ClientMessage): void {
    // Dispatch to specific handlers — implemented by WormholeServer
    // This is the extension point for the DO to hook into
    this.onControlMessage?.(msg);
  }

  onControlMessage?: (msg: ClientMessage) => void;

  sendServerMessage(msg: ServerMessage): void {
    this.deps.send(encodeControlMessage(msg));
  }

  sendTerminalData(channel: number, data: Uint8Array): void {
    this.deps.send(encodeBinaryFrame(channel, data));
  }

  // --- Channel/PTY management ---

  _registerPty(ptyId: string, channel: number, handle: PtyHandle): void {
    this.ptyHandles.set(channel, handle);
  }

  registerPty(ptyId: string, handle: PtyHandle): number | null {
    const channel = this.channelMap.assign(ptyId);
    if (channel === null) return null;
    this.ptyHandles.set(channel, handle);
    return channel;
  }

  unregisterPty(channel: number): void {
    const handle = this.ptyHandles.get(channel);
    if (handle) handle.close();
    this.ptyHandles.delete(channel);
    this.channelMap.release(channel);
  }

  getChannelMap(): ChannelMap {
    return this.channelMap;
  }

  cleanup(): void {
    for (const [channel, handle] of this.ptyHandles) {
      handle.close();
      this.channelMap.release(channel);
    }
    this.ptyHandles.clear();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts packages/sandbox/test/WormholeHandler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sandbox/src/WormholeHandler.ts packages/sandbox/test/WormholeHandler.test.ts
git commit -m "feat(sandbox): WormholeHandler — message routing + WS bridging"
```

---

### Task 7: WormholeServer DO — core state management

**Files:**
- Create: `apps/worker/src/features/sandbox/WormholeServer.ts`
- Modify: `apps/worker/src/index.ts` (route `/sandbox/ws` to new DO)

This task is more integration-heavy. The DO ties together TabbedLayout, ChannelMap, WormholeHandler, and CF Sandbox API.

**Step 1: Write the DO class skeleton**

```typescript
// apps/worker/src/features/sandbox/WormholeServer.ts
import { DurableObject } from "cloudflare:workers";
import { WormholeHandler, type PtyHandle } from "@kampus/sandbox/WormholeHandler";
import { ChannelMap } from "@kampus/sandbox/ChannelMap";
import * as TL from "@kampus/sandbox/TabbedLayout";
import * as Protocol from "@kampus/sandbox/Protocol";

interface SessionRecord {
  id: string;
  sandboxId: string;
  name: string;
  createdAt: number;
}

interface PersistedState {
  sessions: SessionRecord[];
  tabs: TL.Tab[];
  activeTab: number;
}

export class WormholeServer extends DurableObject {
  private sessions: SessionRecord[] = [];
  private layout: TL.TabbedLayout | null = null;
  private channelMap = new ChannelMap();
  private clients = new Set<WebSocket>();
  private sandboxes = new Map<string, unknown>(); // sessionId → CF Sandbox handle
  private terminals = new Map<string, WebSocket>(); // ptyId → CF terminal WS

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.blockConcurrencyWhile(async () => {
      await this.hydrate();
    });
  }

  // --- Persistence ---

  private async hydrate(): Promise<void> {
    const stored = await this.ctx.storage.get<PersistedState>("state");
    if (stored) {
      this.sessions = stored.sessions;
      this.layout = { tabs: stored.tabs, activeTab: stored.activeTab };
      // ChannelMap rebuilt on reconnect, not persisted
    }
  }

  private async persist(): Promise<void> {
    if (!this.layout) return;
    const state: PersistedState = {
      sessions: this.sessions,
      tabs: this.layout.tabs,
      activeTab: this.layout.activeTab,
    };
    await this.ctx.storage.put("state", state);
  }

  // --- WebSocket handling (hibernation API) ---

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.clients.add(server);

    // Send current state to new client
    if (this.layout) {
      const stateMsg = this.buildStateMessage();
      server.send(Protocol.encodeControlMessage(stateMsg));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string): void {
    if (typeof data === "string") return; // ignore text frames
    const bytes = new Uint8Array(data);
    const { channel, payload } = Protocol.parseBinaryFrame(bytes);

    if (channel === Protocol.CONTROL_CHANNEL) {
      const msg = Protocol.decodeControlMessage(payload);
      await this.handleControlMessage(msg);
      return;
    }

    // Route terminal input to CF terminal WS
    const ptyId = this.channelMap.getPtyId(channel);
    if (ptyId) {
      const termWs = this.terminals.get(ptyId);
      if (termWs) termWs.send(payload);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.clients.delete(ws);
    if (this.clients.size === 0) {
      await this.persist();
      // Terminal WSes will drop when DO hibernates — that's fine
    }
  }

  // --- Control message dispatch ---

  private async handleControlMessage(msg: Protocol.ClientMessage): Promise<void> {
    switch (msg.type) {
      case "connect": return this.handleConnect(msg);
      case "session_create": return this.handleSessionCreate(msg);
      case "session_destroy": return this.handleSessionDestroy(msg);
      case "session_rename": return this.handleSessionRename(msg);
      case "tab_create": return this.handleTabCreate(msg);
      case "tab_close": return this.handleTabClose(msg);
      case "tab_rename": return this.handleTabRename(msg);
      case "tab_switch": return this.handleTabSwitch(msg);
      case "pane_split": return this.handlePaneSplit(msg);
      case "pane_close": return this.handlePaneClose(msg);
      case "pane_resize": return this.handlePaneResize(msg);
      case "pane_focus": return this.handlePaneFocus(msg);
    }
  }

  // --- Handlers (stubs — fill in during implementation) ---

  private async handleConnect(msg: Protocol.ConnectMessage): Promise<void> {
    // Eager reconnect all terminals
    // Send full state to client
    await this.reconnectAllTerminals();
    this.broadcastState();
  }

  private async handleSessionCreate(msg: Protocol.SessionCreateMessage): Promise<void> {
    // 1. Create CF Sandbox
    // 2. Add session record
    // 3. Create default tab with one pane (create terminal)
    // 4. Persist + broadcast
  }

  private async handleSessionDestroy(msg: Protocol.SessionDestroyMessage): Promise<void> {
    // 1. Destroy CF Sandbox
    // 2. Remove session + its tabs
    // 3. Release channels for all panes
    // 4. Persist + broadcast
  }

  private async handleSessionRename(msg: Protocol.SessionRenameMessage): Promise<void> {
    const session = this.sessions.find(s => s.id === msg.sessionId);
    if (session) session.name = msg.name;
    await this.persist();
    this.broadcastState();
  }

  private async handleTabCreate(msg: Protocol.TabCreateMessage): Promise<void> {
    if (!this.layout) return;
    // 1. Create terminal in session's sandbox
    // 2. createTab(layout, name, ptyId)
    // 3. Register channel
    // 4. Persist + broadcast layout_update
  }

  private async handleTabClose(msg: Protocol.TabCloseMessage): Promise<void> {
    // 1. Find tab, collect all window keys (ptyIds)
    // 2. Destroy terminals, release channels
    // 3. closeTab(layout, tabIndex)
    // 4. Persist + broadcast
  }

  private async handleTabRename(msg: Protocol.TabRenameMessage): Promise<void> {
    if (!this.layout) return;
    const tabIndex = this.layout.tabs.findIndex(t => t.id === msg.tabId);
    if (tabIndex === -1) return;
    this.layout = TL.renameTab(this.layout, tabIndex, msg.name);
    await this.persist();
    this.broadcastLayoutUpdate();
  }

  private async handleTabSwitch(msg: Protocol.TabSwitchMessage): Promise<void> {
    if (!this.layout) return;
    const tabIndex = this.layout.tabs.findIndex(t => t.id === msg.tabId);
    if (tabIndex === -1) return;
    this.layout = TL.switchTab(this.layout, tabIndex);
    await this.persist();
    this.broadcastLayoutUpdate();
  }

  private async handlePaneSplit(msg: Protocol.PaneSplitMessage): Promise<void> {
    if (!this.layout) return;
    // 1. Find active session from active tab
    // 2. Create terminal in that session's sandbox
    // 3. splitPane(layout, orientation, ptyId)
    // 4. Register channel
    // 5. Persist + broadcast layout_update
  }

  private async handlePaneClose(msg: Protocol.PaneCloseMessage): Promise<void> {
    // 1. Find pane in layout, get ptyId
    // 2. Destroy terminal, release channel
    // 3. closePane(layout, path)
    // 4. Persist + broadcast
  }

  private async handlePaneResize(msg: Protocol.PaneResizeMessage): Promise<void> {
    // Forward resize to CF terminal
    const channel = this.channelMap.getChannel(msg.paneId);
    if (channel === null) return;
    // CF terminal resize — implementation depends on CF Sandbox API
  }

  private async handlePaneFocus(msg: Protocol.PaneFocusMessage): Promise<void> {
    if (!this.layout) return;
    this.layout = TL.moveFocus(this.layout, msg.direction);
    await this.persist();
    this.broadcastLayoutUpdate();
  }

  // --- Broadcast helpers ---

  private buildStateMessage(): Protocol.StateMessage {
    return new Protocol.StateMessage({
      type: "state",
      sessions: this.sessions,
      tabs: this.layout?.tabs.map(t => ({
        id: t.id,
        sessionId: this.getSessionIdForTab(t.id),
        name: t.name,
        layout: t.tree,
        focus: t.focus,
      })) ?? [],
      activeTab: this.layout?.tabs[this.layout.activeTab]?.id ?? null,
      channels: this.channelMap.toRecord(),
    });
  }

  private broadcastState(): void {
    const msg = this.buildStateMessage();
    const encoded = Protocol.encodeControlMessage(msg);
    for (const ws of this.clients) {
      ws.send(encoded);
    }
  }

  private broadcastLayoutUpdate(): void {
    const msg = new Protocol.LayoutUpdateMessage({
      type: "layout_update",
      tabs: this.layout?.tabs.map(t => ({
        id: t.id,
        sessionId: this.getSessionIdForTab(t.id),
        name: t.name,
        layout: t.tree,
        focus: t.focus,
      })) ?? [],
      activeTab: this.layout?.tabs[this.layout.activeTab]?.id ?? null,
      channels: this.channelMap.toRecord(),
    });
    const encoded = Protocol.encodeControlMessage(msg);
    for (const ws of this.clients) {
      ws.send(encoded);
    }
  }

  private getSessionIdForTab(_tabId: string): string {
    // Look up which session a tab belongs to
    // Implementation: stored as part of tab metadata or a separate table
    return "";
  }

  private async reconnectAllTerminals(): Promise<void> {
    // For each session: getSandbox(), for each pty: reconnect terminal WS
    // CF buffer replays output since last connection
  }
}
```

**Step 2: Update worker route**

In `apps/worker/src/index.ts`, the `/sandbox/ws` route already exists. Update the DO class export to use `WormholeServer` instead of `SandboxDO`.

**Step 3: Verify typecheck**

Run: `turbo run typecheck --filter=@kampus/worker`
Expected: Should compile (handler stubs are typed)

**Step 4: Commit**

```bash
git add apps/worker/src/features/sandbox/WormholeServer.ts apps/worker/src/index.ts
git commit -m "feat(sandbox): WormholeServer DO skeleton with control message dispatch"
```

---

### Task 8: Fill in WormholeServer handlers — session + terminal lifecycle

This task fills in the stub handlers from Task 7 with actual CF Sandbox API calls.

**Files:**
- Modify: `apps/worker/src/features/sandbox/WormholeServer.ts`

**Step 1: Implement handleSessionCreate**

Calls `getSandbox()`, creates a terminal, initializes layout with one tab + one pane.

**Step 2: Implement handlePaneSplit**

Gets sandbox for active session, creates new terminal, calls `TL.splitPane`, assigns channel, bridges terminal WS output to client.

**Step 3: Implement handleSessionDestroy**

Destroys CF Sandbox, removes session, cleans up channels, updates layout.

**Step 4: Implement handlePaneClose**

Destroys terminal, releases channel, calls `TL.closePane`.

**Step 5: Implement handleTabCreate / handleTabClose**

Tab lifecycle — create/destroy terminals, update layout.

**Step 6: Implement reconnectAllTerminals**

On wake: for each session, `getSandbox()`, for each pty in layout, `sandbox.terminal()` to reestablish WS. Bridge output to client channels.

**Step 7: Test manually with `wrangler dev`**

Run: `pnpm turbo run dev --filter=@kampus/worker`
Connect via WebSocket, send `session_create`, verify state response.

**Step 8: Commit**

```bash
git add apps/worker/src/features/sandbox/WormholeServer.ts
git commit -m "feat(sandbox): WormholeServer handlers — session + terminal lifecycle"
```

---

### Task 9: Frontend — useWormholeClient hook

**Files:**
- Create: `apps/kamp-us/src/wormhole/use-wormhole-client.ts`

**Step 1: Write the hook**

```typescript
// apps/kamp-us/src/wormhole/use-wormhole-client.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTROL_CHANNEL,
  parseBinaryFrame,
  encodeBinaryFrame,
  type ServerMessage,
  type ClientMessage,
} from "@kampus/sandbox/Protocol";
import type { Tab } from "@kampus/sandbox/TabbedLayout";

interface SessionRecord {
  id: string;
  sandboxId: string;
  name: string;
  createdAt: number;
}

interface WormholeClientState {
  sessions: SessionRecord[];
  tabs: Tab[];
  activeTab: string | null;
  channels: Record<string, number>; // ptyId → channel
  connected: boolean;
}

interface WormholeClient {
  state: WormholeClientState;
  sendTerminalData: (channel: number, data: Uint8Array) => void;
  createSession: (name: string) => void;
  destroySession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  createTab: (sessionId: string, name: string) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  splitPane: (orientation: "horizontal" | "vertical", cols: number, rows: number) => void;
  closePane: (paneId: string) => void;
  resizePane: (paneId: string, cols: number, rows: number) => void;
  moveFocus: (direction: "left" | "right" | "up" | "down") => void;
  onTerminalData: (channel: number, callback: (data: Uint8Array) => void) => () => void;
}

export function useWormholeClient(url: string, viewport: { width: number; height: number }): WormholeClient {
  const wsRef = useRef<WebSocket | null>(null);
  const terminalListeners = useRef(new Map<number, Set<(data: Uint8Array) => void>>());
  const [state, setState] = useState<WormholeClientState>({
    sessions: [],
    tabs: [],
    activeTab: null,
    channels: {},
    connected: false,
  });

  const sendControl = useCallback((msg: ClientMessage) => {
    if (!wsRef.current) return;
    const json = JSON.stringify(msg);
    const payload = new TextEncoder().encode(json);
    wsRef.current.send(encodeBinaryFrame(CONTROL_CHANNEL, payload));
  }, []);

  const sendTerminalData = useCallback((channel: number, data: Uint8Array) => {
    if (!wsRef.current) return;
    wsRef.current.send(encodeBinaryFrame(channel, data));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true }));
      sendControl({ type: "connect", width: viewport.width, height: viewport.height });
    };

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      const { channel, payload } = parseBinaryFrame(data);

      if (channel === CONTROL_CHANNEL) {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as ServerMessage;
        handleServerMessage(msg);
      } else {
        // Route to terminal listeners
        const listeners = terminalListeners.current.get(channel);
        if (listeners) {
          for (const cb of listeners) cb(payload);
        }
      }
    };

    ws.onclose = () => {
      setState(s => ({ ...s, connected: false }));
    };

    return () => { ws.close(); };
  }, [url]);

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "state":
        setState(s => ({
          ...s,
          sessions: msg.sessions as SessionRecord[],
          tabs: msg.tabs as Tab[],
          activeTab: msg.activeTab,
          channels: msg.channels as Record<string, number>,
        }));
        break;
      case "layout_update":
        setState(s => ({
          ...s,
          tabs: msg.tabs as Tab[],
          activeTab: msg.activeTab,
          channels: msg.channels as Record<string, number>,
        }));
        break;
      case "session_exit":
        // Could update UI to show "exited" state on that pane
        break;
      case "sessions_reset":
        // Could show notification that session was reset
        break;
    }
  }

  const onTerminalData = useCallback((channel: number, callback: (data: Uint8Array) => void) => {
    if (!terminalListeners.current.has(channel)) {
      terminalListeners.current.set(channel, new Set());
    }
    terminalListeners.current.get(channel)!.add(callback);
    return () => {
      terminalListeners.current.get(channel)?.delete(callback);
    };
  }, []);

  return {
    state,
    sendTerminalData,
    onTerminalData,
    createSession: (name) => sendControl({ type: "session_create", name }),
    destroySession: (sessionId) => sendControl({ type: "session_destroy", sessionId }),
    renameSession: (sessionId, name) => sendControl({ type: "session_rename", sessionId, name }),
    createTab: (sessionId, name) => sendControl({ type: "tab_create", sessionId, name }),
    closeTab: (tabId) => sendControl({ type: "tab_close", tabId }),
    switchTab: (tabId) => sendControl({ type: "tab_switch", tabId }),
    renameTab: (tabId, name) => sendControl({ type: "tab_rename", tabId, name }),
    splitPane: (orientation, cols, rows) => sendControl({ type: "pane_split", orientation, cols, rows }),
    closePane: (paneId) => sendControl({ type: "pane_close", paneId }),
    resizePane: (paneId, cols, rows) => sendControl({ type: "pane_resize", paneId, cols, rows }),
    moveFocus: (direction) => sendControl({ type: "pane_focus", direction }),
  };
}
```

**Step 2: Commit**

```bash
git add apps/kamp-us/src/wormhole/use-wormhole-client.ts
git commit -m "feat(kamp-us): useWormholeClient hook — dumb WS client for Wormhole protocol"
```

---

### Task 10: Frontend — UI components

**Files:**
- Create: `apps/kamp-us/src/wormhole/MuxClient.tsx`
- Create: `apps/kamp-us/src/wormhole/SessionBar.tsx`
- Create: `apps/kamp-us/src/wormhole/TabBar.tsx`
- Create: `apps/kamp-us/src/wormhole/PaneLayout.tsx`

These are React components that render the state from `useWormholeClient`. They are straightforward renderers:

- **MuxClient** — top-level, owns the hook, passes state down
- **SessionBar** — renders session list, create/switch/destroy buttons
- **TabBar** — renders tabs for active session, create/close/switch/rename
- **PaneLayout** — renders layout-tree recursively, each leaf is a `<GhosttyTerminal />`

Implementation details depend on existing UI patterns in the app. Refer to existing wormhole page components for styling conventions.

**Step 1: Implement components following existing patterns**

**Step 2: Wire up to the `/sandbox` route**

**Step 3: Manual test with `pnpm turbo run dev`**

**Step 4: Commit**

```bash
git add apps/kamp-us/src/wormhole/
git commit -m "feat(kamp-us): Wormhole UI components — MuxClient, SessionBar, TabBar, PaneLayout"
```

---

### Task 11: Update barrel exports and typecheck

**Files:**
- Modify: `packages/sandbox/src/index.ts`
- Modify: `packages/sandbox/package.json` (exports field)

**Step 1: Update package.json exports**

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./Protocol": "./src/Protocol.ts",
    "./ChannelMap": "./src/ChannelMap.ts",
    "./TabbedLayout": "./src/TabbedLayout.ts",
    "./WormholeHandler": "./src/WormholeHandler.ts",
    "./Errors": "./src/Errors.ts",
    "./Sandbox": "./src/Sandbox.ts"
  }
}
```

**Step 2: Run full typecheck**

Run: `turbo run typecheck`
Expected: PASS across all packages

**Step 3: Run all sandbox tests**

Run: `pnpm vitest run --config packages/sandbox/vitest.config.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/sandbox/
git commit -m "chore(sandbox): update exports and verify typecheck"
```

---

### Task 12: End-to-end integration test

**Step 1: Start dev server**

Run: `pnpm turbo run dev`

**Step 2: Test flow manually**

1. Open browser to `/sandbox`
2. Verify session creation (should see one terminal pane)
3. Split pane — verify second terminal appears
4. Type in both panes — verify I/O works
5. Switch tabs — verify focus restores
6. Refresh page — verify layout restores from DO storage
7. Open second browser tab — verify multi-client (same view)

**Step 3: Commit any fixes**

```bash
git commit -m "fix(sandbox): integration test fixes"
```
