import {Menu} from "@base-ui/react/menu";
import {Tabs} from "@base-ui/react/tabs";
import {useMux} from "./MuxClient.tsx";
import styles from "./WormholeLayout.module.css";

export function ChromeBar() {
	const {state, createSession, destroySession, createTab, closeTab, switchTab} = useMux();

	// Derive active session from active tab
	const activeTabRecord = state.tabs.find((t) => t.id === state.activeTab);
	const activeSessionId = activeTabRecord?.sessionId;
	const activeSession = state.sessions.find((s) => s.id === activeSessionId);

	// Tabs for the active session
	const visibleTabs = activeSessionId
		? state.tabs.filter((t) => t.sessionId === activeSessionId)
		: [];

	return (
		<div className={styles.chromeBar}>
			{/* ── Session Selector (left zone) ── */}
			<div className={styles.sessionSelector}>
				<span className={styles.sessionLabel}>wormhole</span>
				<Menu.Root>
					<Menu.Trigger className={styles.sessionTrigger}>
						<span>{activeSession?.name ?? "—"}</span>
						<span className={styles.chevron} />
					</Menu.Trigger>
					<Menu.Portal>
						<Menu.Positioner
							className={styles.sessionPositioner}
							side="bottom"
							align="start"
							sideOffset={1}
						>
							<Menu.Popup className={styles.sessionPopup}>
								{state.sessions.map((session) => {
									const firstTab = state.tabs.find((t) => t.sessionId === session.id);
									return (
										<Menu.Item
											key={session.id}
											className={styles.sessionItem}
											data-active={session.id === activeSessionId || undefined}
											onClick={() => {
												if (firstTab) switchTab(firstTab.id);
											}}
										>
											<span>{session.name}</span>
											<button
												type="button"
												className={styles.closeIcon}
												aria-label={`Destroy ${session.name}`}
												onClick={(e) => {
													e.stopPropagation();
													destroySession(session.id);
												}}
											>
												<CloseIconSvg />
											</button>
										</Menu.Item>
									);
								})}
								<Menu.Separator className={styles.sessionDivider} />
								<Menu.Item
									className={styles.sessionAction}
									onClick={() => createSession(`session-${state.sessions.length + 1}`)}
								>
									+ New Session
								</Menu.Item>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
			</div>

			{/* ── Tab Bar (middle zone) ── */}
			<Tabs.Root
				className={styles.tabsRoot}
				value={state.activeTab}
				onValueChange={(value) => switchTab(value as string)}
			>
				<Tabs.List className={styles.tabList}>
					{visibleTabs.map((tab) => (
						<Tabs.Tab key={tab.id} value={tab.id} className={styles.tabItem}>
							<span>{tab.name}</span>
							<button
								type="button"
								className={styles.closeIcon}
								aria-label={`Close ${tab.name}`}
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
							>
								<CloseIconSvg />
							</button>
						</Tabs.Tab>
					))}
					{activeSessionId && (
						<button
							type="button"
							className={styles.tabAdd}
							onClick={() => createTab(activeSessionId, `tab-${visibleTabs.length + 1}`)}
							aria-label="New tab"
						>
							+
						</button>
					)}
				</Tabs.List>
			</Tabs.Root>

			{/* ── Status Dot (right zone) ── */}
			<div className={styles.chromeStatus}>
				<div
					className={styles.statusDot}
					title={state.connected ? "Connected" : "Disconnected"}
					data-disconnected={!state.connected || undefined}
				/>
			</div>
		</div>
	);
}

function CloseIconSvg() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 8 8"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
		>
			<line x1="1" y1="1" x2="7" y2="7" />
			<line x1="7" y1="1" x2="1" y2="7" />
		</svg>
	);
}
