// apps/kamp-us/src/wormhole/PaneLayout.tsx
import type * as LT from "@usirin/layout-tree";
import {Fragment} from "react";
import {Group, Panel, Separator} from "react-resizable-panels";
import {useMux} from "./MuxClient.tsx";
import {TerminalPane} from "./TerminalPane.tsx";
import styles from "./WormholeLayout.module.css";

export function PaneLayout() {
	const {state} = useMux();

	return (
		<div style={{flex: 1, position: "relative"}}>
			{state.tabs.map((tab) => {
				const tree = tab.layout as LT.Tree;
				if (!tree || !tree.root) return null;

				const isActive = tab.id === state.activeTab;

				return (
					<div
						key={tab.id}
						style={{
							position: "absolute",
							inset: 0,
							visibility: isActive ? "visible" : "hidden",
						}}
					>
						<Group orientation={tree.root.orientation}>
							{renderChildren(tree.root, [], tab.focus, state.channels, state.paneConnected)}
						</Group>
					</div>
				);
			})}
		</div>
	);
}

function renderChildren(
	stack: LT.Stack,
	path: LT.StackPath,
	focus: number[],
	channels: Record<string, number>,
	paneConnected: Record<string, boolean>,
) {
	return stack.children.map((child, i) => {
		const childPath = [...path, i];
		return (
			<Fragment key={child.id}>
				{i > 0 && (
					<Separator
						className={
							stack.orientation === "horizontal" ? styles.resizeHandleH : styles.resizeHandleV
						}
					/>
				)}
				<Panel>
					{child.tag === "window" ? (
						renderWindow(child as LT.Window, childPath, focus, channels, paneConnected)
					) : (
						<Group orientation={(child as LT.Stack).orientation}>
							{renderChildren(child as LT.Stack, childPath, focus, channels, paneConnected)}
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
	focus: number[],
	channels: Record<string, number>,
	paneConnected: Record<string, boolean>,
) {
	const channel = channels[window.key];
	if (channel === undefined) return <div>Loading...</div>;

	const isFocused = JSON.stringify(path) === JSON.stringify(focus);
	const isConnected = paneConnected[window.key] ?? true;

	return (
		<TerminalPane
			channel={channel}
			sessionId={window.key}
			focused={isFocused}
			connected={isConnected}
			onFocus={() => {
				/* focus is managed by DO */
			}}
		/>
	);
}
