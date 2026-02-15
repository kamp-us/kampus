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

function nextTabId(): string {
  return crypto.randomUUID();
}

/**
 * The layout-tree library uses inverted orientation naming:
 * - "vertical" orientation = children arranged left/right (horizontal layout)
 * - "horizontal" orientation = children arranged top/bottom (vertical layout)
 *
 * TabbedLayout uses user-facing semantics:
 * - "horizontal" = panes side by side (left/right)
 * - "vertical" = panes stacked (top/bottom)
 *
 * This function converts from user-facing to library convention.
 */
function toLibraryOrientation(orientation: LT.Orientation): LT.Orientation {
  return orientation === "horizontal" ? "vertical" : "horizontal";
}

export function getActiveTab(layout: TabbedLayout): Tab {
  return layout.tabs[layout.activeTab];
}

export function getFocusedWindow(layout: TabbedLayout): LT.Window | null {
  const tab = getActiveTab(layout);
  const node = LT.getAt(tab.tree.root, tab.focus);
  if (node && node.tag === "window") return node as LT.Window;
  return null;
}

export function allWindowKeys(layout: TabbedLayout): string[] {
  const keys: string[] = [];
  function walk(node: LT.Window | LT.Stack) {
    if (node.tag === "window") {
      keys.push((node as LT.Window).key);
    } else {
      (node as LT.Stack).children.forEach(walk);
    }
  }
  for (const tab of layout.tabs) {
    walk(tab.tree.root);
  }
  return keys;
}

// --- Tab operations ---

export function createTabbedLayout(
  tabName: string,
  windowKey: string,
): TabbedLayout {
  const window = LT.createWindow(windowKey);
  const tree = LT.createTree(LT.createStack("vertical", [window]));
  return {
    tabs: [{ id: nextTabId(), name: tabName, tree, focus: [0] }],
    activeTab: 0,
  };
}

export function createTab(
  layout: TabbedLayout,
  name: string,
  windowKey: string,
): TabbedLayout {
  const window = LT.createWindow(windowKey);
  const tree = LT.createTree(LT.createStack("vertical", [window]));
  const newTab: Tab = { id: nextTabId(), name, tree, focus: [0] };
  return {
    tabs: [...layout.tabs, newTab],
    activeTab: layout.tabs.length,
  };
}

export function closeTab(
  layout: TabbedLayout,
  tabIndex: number,
): TabbedLayout | null {
  if (layout.tabs.length <= 1) return null;
  const tabs = layout.tabs.filter((_, i) => i !== tabIndex);
  let activeTab = layout.activeTab;
  if (tabIndex < activeTab) {
    activeTab--;
  } else if (activeTab >= tabs.length) {
    activeTab = tabs.length - 1;
  }
  return { tabs, activeTab };
}

export function switchTab(
  layout: TabbedLayout,
  tabIndex: number,
): TabbedLayout {
  return { ...layout, activeTab: tabIndex };
}

export function renameTab(
  layout: TabbedLayout,
  tabIndex: number,
  name: string,
): TabbedLayout {
  const tabs = layout.tabs.map((tab, i) =>
    i === tabIndex ? { ...tab, name } : tab,
  );
  return { ...layout, tabs };
}

// --- Pane operations (scoped to active tab) ---

export function splitPane(
  layout: TabbedLayout,
  paneId: string,
  orientation: LT.Orientation,
  newWindowKey: string,
): { layout: TabbedLayout; newPath: LT.StackPath } {
  const tab = getActiveTab(layout);

  // Find the target pane's path by key
  const targetWindow = LT.find(tab.tree, (w) => w.key === paneId);
  if (!targetWindow) return { layout, newPath: tab.focus };
  const targetPath = LT.findWindowPath(tab.tree, targetWindow);
  if (!targetPath) return { layout, newPath: tab.focus };

  const libOrientation = toLibraryOrientation(orientation);
  const newTree = LT.split(tab.tree, targetPath, libOrientation);

  // split() has three behaviors depending on parent orientation vs requested:
  // 1. Same orientation: replaces window with [window, clone] → clone at [...parent, idx+1]
  // 2. Different orientation, single child: flips parent, sets [window, clone] → clone at [...parent, 1]
  // 3. Different orientation, multiple children: wraps into sub-stack → clone at [...targetPath, 1]
  const parentPath = targetPath.slice(0, -1);
  const parent = LT.getAt(tab.tree.root, parentPath) as LT.Stack;
  const lastIdx = targetPath[targetPath.length - 1];

  let newPath: LT.StackPath;
  if (libOrientation === parent.orientation || parent.children.length === 1) {
    // Cases 1 & 2: clone is a sibling
    newPath = [...parentPath, lastIdx + 1];
  } else {
    // Case 3: window was wrapped in a sub-stack, clone is at [...targetPath, 1]
    newPath = [...targetPath, 1];
  }

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

  // If tree root has no children, the tab is empty
  if (newTree.root.children.length === 0) return null;

  // Find a new focus target: nearest sibling or descend into first window
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = LT.getAt(newTree.root, parentPath);

  let newFocus: LT.StackPath;
  if (parent && parent.tag === "stack") {
    const stack = parent as LT.Stack;
    if (stack.children.length > 0) {
      const newIdx = Math.min(idx, stack.children.length - 1);
      newFocus = [...parentPath, newIdx];
      // Descend to first window if we landed on a stack
      let node = LT.getAt(newTree.root, newFocus);
      while (node && node.tag === "stack") {
        const s = node as LT.Stack;
        if (s.children.length === 0) break;
        newFocus = [...newFocus, 0];
        node = LT.getAt(newTree.root, newFocus);
      }
    } else {
      newFocus = [0];
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
