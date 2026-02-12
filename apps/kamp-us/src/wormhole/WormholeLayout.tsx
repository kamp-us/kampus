import type * as LT from "@usirin/layout-tree";
import {Fragment, useEffect, useRef} from "react";
import {Group, Panel, Separator} from "react-resizable-panels";
import {TerminalPane} from "./TerminalPane.tsx";
import {useWormholeLayout} from "./use-wormhole-layout.ts";
import styles from "./WormholeLayout.module.css";

export function WormholeLayout() {
	const layout = useWormholeLayout();
	const initialized = useRef(false);

	// Create first session on mount
	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;
		layout.createInitialSession(80, 24);
	}, [layout.createInitialSession]);

	// Keybindings
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey) {
				switch (e.key) {
					case "D":
						e.preventDefault();
						layout.splitPane("horizontal", 80, 24);
						return;
					case "E":
						e.preventDefault();
						layout.splitPane("vertical", 80, 24);
						return;
					case "W":
						e.preventDefault();
						layout.closePane(layout.focused);
						return;
					case "ArrowLeft":
						e.preventDefault();
						layout.focusDirection("left");
						return;
					case "ArrowRight":
						e.preventDefault();
						layout.focusDirection("right");
						return;
					case "ArrowUp":
						e.preventDefault();
						layout.focusDirection("up");
						return;
					case "ArrowDown":
						e.preventDefault();
						layout.focusDirection("down");
						return;
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [layout]);

	if (layout.tree.root.children.length === 0) {
		return <div className={styles.container}>Connecting...</div>;
	}

	return (
		<div className={styles.container}>
			<Group orientation={layout.tree.root.orientation}>
				{renderChildren(layout.tree.root, [], layout)}
			</Group>
		</div>
	);
}

function renderChildren(
	stack: LT.Stack,
	path: LT.StackPath,
	layout: ReturnType<typeof useWormholeLayout>,
) {
	return stack.children.map((child, i) => {
		const childPath = [...path, i];
		return (
			<Fragment key={child.id}>
				{i > 0 && <Separator className={styles.resizeHandle} />}
				<Panel>
					{child.tag === "window" ? (
						renderWindow(child as LT.Window, childPath, layout)
					) : (
						<Group orientation={(child as LT.Stack).orientation}>
							{renderChildren(child as LT.Stack, childPath, layout)}
						</Group>
					)}
				</Panel>
			</Fragment>
		);
	});
}

function renderWindow(
	window: LT.Window,
	path: LT.StackPath,
	layout: ReturnType<typeof useWormholeLayout>,
) {
	const info = layout.getPaneInfo(window.key);
	if (!info) return <div>Loading...</div>;

	const isFocused = JSON.stringify(path) === JSON.stringify(layout.focused);

	return (
		<TerminalPane
			channel={info.channel}
			sessionId={info.sessionId}
			focused={isFocused}
			onFocus={() => layout.setFocused(path)}
		/>
	);
}
