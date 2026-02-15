// apps/kamp-us/src/wormhole/TabBar.tsx
import {useMux} from "./MuxClient.tsx";

export function TabBar() {
	const {state, createTab, closeTab, switchTab} = useMux();

	// Find which session is associated with the active tab
	const activeTabRecord = state.tabs.find((t) => t.id === state.activeTab);
	const sessionId = activeTabRecord?.sessionId;

	// Show tabs belonging to the active session
	const visibleTabs = sessionId ? state.tabs.filter((t) => t.sessionId === sessionId) : [];

	return (
		<div
			data-component="tab-bar"
			style={{display: "flex", gap: 4, padding: "2px 8px", borderBottom: "1px solid var(--border, #333)"}}
		>
			{visibleTabs.map((tab) => (
				<div
					key={tab.id}
					data-active={tab.id === state.activeTab || undefined}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						padding: "2px 8px",
						cursor: "pointer",
						opacity: tab.id === state.activeTab ? 1 : 0.6,
					}}
				>
					<button
						type="button"
						onClick={() => switchTab(tab.id)}
						style={{background: "none", border: "none", color: "inherit", cursor: "pointer"}}
					>
						{tab.name}
					</button>
					<button
						type="button"
						onClick={() => closeTab(tab.id)}
						aria-label={`Close tab ${tab.name}`}
						style={{background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8em"}}
					>
						&times;
					</button>
				</div>
			))}
			{sessionId && (
				<button
					type="button"
					onClick={() => createTab(sessionId, `tab-${visibleTabs.length + 1}`)}
					style={{background: "none", border: "none", color: "inherit", cursor: "pointer"}}
				>
					+
				</button>
			)}
		</div>
	);
}
