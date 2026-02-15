// apps/kamp-us/src/wormhole/SessionBar.tsx
import {useMux} from "./MuxClient.tsx";

export function SessionBar() {
	const {state, createSession, destroySession, switchTab} = useMux();

	// Find which session owns the active tab
	const activeTabRecord = state.tabs.find((t) => t.id === state.activeTab);
	const activeSessionId = activeTabRecord?.sessionId;

	return (
		<div
			data-component="session-bar"
			style={{display: "flex", gap: 8, padding: "4px 8px", borderBottom: "1px solid #333"}}
		>
			{state.sessions.map((session) => {
				const isActive = session.id === activeSessionId;
				// Find first tab belonging to this session to switch to it
				const firstTab = state.tabs.find((t) => t.sessionId === session.id);

				return (
					<div key={session.id} style={{display: "flex", alignItems: "center", gap: 4}}>
						<button
							type="button"
							onClick={() => {
								if (firstTab) switchTab(firstTab.id);
							}}
							style={{
								background: "none",
								border: "none",
								color: "inherit",
								cursor: "pointer",
								fontWeight: isActive ? "bold" : "normal",
								opacity: isActive ? 1 : 0.6,
							}}
						>
							{session.name}
						</button>
						<button
							type="button"
							onClick={() => destroySession(session.id)}
							aria-label={`Destroy session ${session.name}`}
							style={{background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8em"}}
						>
							&times;
						</button>
					</div>
				);
			})}
			<button
				type="button"
				onClick={() => createSession(`session-${state.sessions.length + 1}`)}
				style={{background: "none", border: "none", color: "inherit", cursor: "pointer"}}
			>
				+ Session
			</button>
		</div>
	);
}
