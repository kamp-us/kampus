import * as LT from "@usirin/layout-tree";
import {useCallback, useEffect, useRef, useState} from "react";
import {type SessionCreatedEvent, useWormholeGateway} from "./WormholeGateway.tsx";

export interface PaneInfo {
	sessionId: string;
	channel: number;
}

const STORAGE_KEY = "wormhole:layout";

interface PersistedLayout {
	version: 1;
	tree: LT.Tree;
	panes: Array<{key: string; sessionId: string}>;
	focused: LT.StackPath;
}

function loadPersistedLayout(): PersistedLayout | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.version !== 1) return null;
		return parsed as PersistedLayout;
	} catch {
		return null;
	}
}

// Cache so initializers don't parse twice
let cachedPersistedLayout: PersistedLayout | null | undefined;
function getCachedPersistedLayout(): PersistedLayout | null {
	if (cachedPersistedLayout === undefined) {
		cachedPersistedLayout = loadPersistedLayout();
	}
	return cachedPersistedLayout;
}

export function useWormholeLayout() {
	const gateway = useWormholeGateway();
	const [tree, setTree] = useState(() => {
		const stored = getCachedPersistedLayout();
		if (stored) return stored.tree;
		return LT.createTree(LT.createStack("vertical", []));
	});
	const [focused, setFocused] = useState<LT.StackPath>(() => {
		const stored = getCachedPersistedLayout();
		if (stored) return stored.focused;
		return [0];
	});
	const paneMap = useRef(
		(() => {
			const stored = getCachedPersistedLayout();
			const map = new Map<string, PaneInfo>();
			if (stored) {
				for (const p of stored.panes) {
					map.set(p.key, {sessionId: p.sessionId, channel: -1});
				}
			}
			return map;
		})(),
	);
	const pendingSplits = useRef<LT.Orientation[]>([]);

	// --- Layout persistence: save ---
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const saveLayout = useCallback(() => {
		const persisted: PersistedLayout = {
			version: 1,
			tree,
			panes: Array.from(paneMap.current.entries()).map(([key, info]) => ({
				key,
				sessionId: info.sessionId,
			})),
			focused,
		};
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
		} catch {
			/* quota exceeded, ignore */
		}
	}, [tree, focused]);

	const debouncedSave = useCallback(() => {
		if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(saveLayout, 500);
	}, [saveLayout]);

	// Debounced save on tree/focused changes
	useEffect(() => {
		debouncedSave();
		return () => {
			if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
		};
	}, [debouncedSave]);

	// Immediate save on beforeunload
	useEffect(() => {
		const handler = () => saveLayout();
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [saveLayout]);

	// --- Layout persistence: orphan cleanup ---
	useEffect(() => {
		return gateway.onSessionList((sessions) => {
			const serverIds = new Set(sessions.map((s) => s.id));
			let changed = false;
			for (const [key, info] of paneMap.current) {
				if (!serverIds.has(info.sessionId)) {
					paneMap.current.delete(key);
					changed = true;
				}
			}
			if (changed) {
				// Trigger re-render so orphan panes show "Loading..." and user can close them.
				// A full tree rebuild to remove orphan windows would be ideal but path-shift
				// handling is complex; for Phase 1 just let the UI reflect the missing paneMap entry.
				setTree((prev) => ({...prev}));
			}
		});
	}, [gateway]);

	// Listen for session_created to wire panes
	useEffect(() => {
		return gateway.onSessionCreated((event: SessionCreatedEvent) => {
			const {sessionId, channel} = event;

			// Reattach: just update channel, don't modify tree
			const existing = paneMap.current.get(sessionId);
			if (existing) {
				paneMap.current.set(sessionId, {sessionId, channel});
				return;
			}

			// New session
			paneMap.current.set(sessionId, {sessionId, channel});

			setTree((prev) => {
				// First session (empty tree) — create initial pane
				if (prev.root.children.length === 0) {
					const window = LT.createWindow(sessionId);
					return LT.createTree(LT.createStack("vertical", [window]));
				}
				// Pending split — add new pane
				if (pendingSplits.current.length > 0) {
					// biome-ignore lint/style/noNonNullAssertion: length check guarantees element
					const orientation = pendingSplits.current.shift()!;
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
			pendingSplits.current.push(orientation);
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
				gateway.destroySession(info.sessionId);
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

	const reattachAll = useCallback(
		(cols: number, rows: number) => {
			for (const [, info] of paneMap.current) {
				gateway.attachSession(info.sessionId, cols, rows);
			}
		},
		[gateway],
	);

	const sessionCount = useCallback(() => paneMap.current.size, []);

	return {
		tree,
		focused,
		setFocused,
		createInitialSession,
		splitPane,
		closePane,
		focusDirection,
		getPaneInfo,
		reattachAll,
		sessionCount,
	};
}
