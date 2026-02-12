import {useCallback, useEffect, useRef, useState} from "react";
import * as LT from "@usirin/layout-tree";
import {useWormholeGateway, type SessionCreatedEvent} from "./WormholeGateway.tsx";

export interface PaneInfo {
  sessionId: string;
  channel: number;
}

export function useWormholeLayout() {
  const gateway = useWormholeGateway();
  const [tree, setTree] = useState(() => LT.createTree(LT.createStack("vertical", [])));
  const [focused, setFocused] = useState<LT.StackPath>([0]);
  const paneMap = useRef(new Map<string, PaneInfo>());
  const pendingSplitRef = useRef<{orientation: LT.Orientation} | null>(null);

  // Listen for session_created to wire panes
  useEffect(() => {
    return gateway.onSessionCreated((event: SessionCreatedEvent) => {
      const {sessionId, channel} = event;
      paneMap.current.set(sessionId, {sessionId, channel});

      setTree((prev) => {
        // First session (empty tree) — create initial pane
        if (prev.root.children.length === 0) {
          const window = LT.createWindow(sessionId);
          return LT.createTree(LT.createStack("vertical", [window]));
        }
        // Pending split — add new pane
        if (pendingSplitRef.current) {
          const orientation = pendingSplitRef.current.orientation;
          pendingSplitRef.current = null;
          const updated = LT.split(prev, focused, orientation);
          // split() clones the focused window — update the NEW pane's key to the new sessionId
          const newPath = [...focused.slice(0, -1), (focused[focused.length - 1] ?? 0) + 1];
          return LT.updateWindow(updated, newPath, sessionId);
        }
        return prev;
      });
    });
  }, [gateway, focused]);

  const createInitialSession = useCallback(
    (cols: number, rows: number) => {
      gateway.createSession(cols, rows);
    },
    [gateway],
  );

  const splitPane = useCallback(
    (orientation: LT.Orientation, cols: number, rows: number) => {
      pendingSplitRef.current = {orientation};
      gateway.createSession(cols, rows);
    },
    [gateway],
  );

  const closePane = useCallback(
    (path: LT.StackPath) => {
      const node = LT.getAt(tree.root, path);
      if (node?.tag !== "window") return;
      const window = node as LT.Window;
      const info = paneMap.current.get(window.key);
      if (info) {
        gateway.detachSession(info.sessionId);
        paneMap.current.delete(window.key);
      }
      setTree((prev) => LT.remove(prev, path));
    },
    [tree, gateway],
  );

  const focusDirection = useCallback(
    (direction: LT.Direction) => {
      const sibling = LT.findSibling(tree, focused, direction);
      if (!sibling) return;
      const siblingPath = LT.findWindowPath(tree, sibling);
      if (siblingPath) setFocused(siblingPath);
    },
    [tree, focused],
  );

  const getPaneInfo = useCallback((sessionId: string): PaneInfo | undefined => {
    return paneMap.current.get(sessionId);
  }, []);

  return {
    tree,
    focused,
    setFocused,
    createInitialSession,
    splitPane,
    closePane,
    focusDirection,
    getPaneInfo,
  };
}
