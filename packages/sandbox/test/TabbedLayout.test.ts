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
      expect(updated!.tabs).toHaveLength(1);
      expect(updated!.activeTab).toBe(0);
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
      const { layout: updated, newPath } = splitPane(layout, "pty-1", "horizontal", "pty-2");
      const keys = allWindowKeys(updated);
      expect(keys).toContain("pty-1");
      expect(keys).toContain("pty-2");
      expect(newPath).toBeDefined();
    });

    it("moves focus to the new pane", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: updated } = splitPane(layout, "pty-1", "horizontal", "pty-2");
      const focused = getFocusedWindow(updated);
      expect(focused?.key).toBe("pty-2");
    });

    it("splits in opposite direction after same-direction split", () => {
      let layout = createTabbedLayout("main", "pty-1");
      // Split horizontal twice (same direction)
      const { layout: l2 } = splitPane(layout, "pty-1", "horizontal", "pty-2");
      const { layout: l3 } = splitPane(l2, "pty-2", "horizontal", "pty-3");
      expect(getFocusedWindow(l3)?.key).toBe("pty-3");

      // Now split vertical (opposite direction) — this wraps into sub-stack
      const { layout: l4 } = splitPane(l3, "pty-3", "vertical", "pty-4");
      expect(getFocusedWindow(l4)?.key).toBe("pty-4");
      expect(allWindowKeys(l4)).toHaveLength(4);

      // Should still be able to split again
      const { layout: l5 } = splitPane(l4, "pty-4", "horizontal", "pty-5");
      expect(getFocusedWindow(l5)?.key).toBe("pty-5");
      expect(allWindowKeys(l5)).toHaveLength(5);
    });
  });

  describe("closePane", () => {
    it("removes pane and updates focus", () => {
      const layout = createTabbedLayout("main", "pty-1");
      const { layout: split } = splitPane(layout, "pty-1", "horizontal", "pty-2");
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
      const { layout: split } = splitPane(layout, "pty-1", "horizontal", "pty-2");
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
      const { layout: split } = splitPane(layout, "pty-1", "horizontal", "pty-2");
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
      const { layout: split } = splitPane(layout, "pty-1", "horizontal", "pty-2");
      layout = createTab(split, "tab2", "pty-3");
      const keys = allWindowKeys(layout);
      expect(keys).toEqual(expect.arrayContaining(["pty-1", "pty-2", "pty-3"]));
      expect(keys).toHaveLength(3);
    });
  });
});
