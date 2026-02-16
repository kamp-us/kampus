# Stale Session Detection & Lazy Reconnect — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect disconnected terminal panes and show a "Disconnected" overlay; reconnect lazily when the user types into a dead pane.

**Architecture:** Derive per-pane connection status from `this.terminals.has(ptyId)` on the DO. Broadcast it in state/layout messages. Frontend renders overlay. Server handles reconnect on input to disconnected pane. Channels stay assigned across disconnect/reconnect.

**Tech Stack:** Effect Schema, Cloudflare Durable Objects, React, CSS Modules

**Design doc:** `docs/plans/2026-02-15-stale-session-design.md`

---

### Task 1: Protocol — add `connected`, remove `SessionExitMessage`

**Files:**
- Modify: `packages/sandbox/src/Protocol.ts`

**Step 1: Add `connected` field to `StateMessage`**

In `StateMessage` (line 155), add after `channels`:

```typescript
export class StateMessage extends S.Class<StateMessage>("StateMessage")({
	type: S.Literal("state"),
	sessions: S.Array(SessionRecord),
	tabs: S.Array(TabRecord),
	activeTab: S.NullOr(S.String),
	channels: S.Record({key: S.String, value: S.Number}),
	connected: S.Record({key: S.String, value: S.Boolean}),
}) {}
```

**Step 2: Add `connected` field to `LayoutUpdateMessage`**

In `LayoutUpdateMessage` (line 164), add after `channels`:

```typescript
export class LayoutUpdateMessage extends S.Class<LayoutUpdateMessage>("LayoutUpdateMessage")({
	type: S.Literal("layout_update"),
	tabs: S.Array(TabRecord),
	activeTab: S.NullOr(S.String),
	channels: S.Record({key: S.String, value: S.Number}),
	connected: S.Record({key: S.String, value: S.Boolean}),
}) {}
```

**Step 3: Remove `SessionExitMessage`**

Delete the `SessionExitMessage` class (lines 172-178).

**Step 4: Remove from `ServerMessage` union**

Update `ServerMessage` union (line 187) to remove `SessionExitMessage`:

```typescript
export const ServerMessage = S.Union(
	StateMessage,
	LayoutUpdateMessage,
	SessionsResetMessage,
);
```

**Step 5: Typecheck**

Run: `turbo run typecheck --filter=@kampus/sandbox`

Expected: FAIL — `WormholeServer.ts` and `use-wormhole-client.ts` reference the removed/changed types. That's fine, we fix them in subsequent tasks.

**Step 6: Commit**

```
feat(sandbox): add connected field to protocol, remove SessionExitMessage
```

---

### Task 2: Backend — state builder includes `connected`

**Files:**
- Modify: `apps/worker/src/features/sandbox/WormholeServer.ts`

**Step 1: Update `buildStateMessage` to include `connected`**

In `buildStateMessage()` (line 369), add `connected` field derived from `this.terminals`:

```typescript
private buildStateMessage(): Protocol.StateMessage {
	const channels = this.channelMap.toRecord();
	const connected: Record<string, boolean> = {};
	for (const ptyId of Object.keys(channels)) {
		connected[ptyId] = this.terminals.has(ptyId);
	}
	return new Protocol.StateMessage({
		type: "state",
		sessions: this.sessions,
		tabs:
			this.layout?.tabs.map((t) => ({
				id: t.id,
				sessionId: this.getSessionIdForTab(t.id),
				name: t.name,
				layout: t.tree,
				focus: t.focus,
			})) ?? [],
		activeTab: this.layout?.tabs[this.layout.activeTab]?.id ?? null,
		channels,
		connected,
	});
}
```

**Step 2: Update `broadcastLayoutUpdate` to include `connected`**

In `broadcastLayoutUpdate()` (line 394), same pattern:

```typescript
private broadcastLayoutUpdate(): void {
	const channels = this.channelMap.toRecord();
	const connected: Record<string, boolean> = {};
	for (const ptyId of Object.keys(channels)) {
		connected[ptyId] = this.terminals.has(ptyId);
	}
	const msg = new Protocol.LayoutUpdateMessage({
		type: "layout_update",
		tabs:
			this.layout?.tabs.map((t) => ({
				id: t.id,
				sessionId: this.getSessionIdForTab(t.id),
				name: t.name,
				layout: t.tree,
				focus: t.focus,
			})) ?? [],
		activeTab: this.layout?.tabs[this.layout.activeTab]?.id ?? null,
		channels,
		connected,
	});
	const encoded = Protocol.encodeControlMessage(msg);
	for (const ws of this.clients) {
		ws.send(encoded);
	}
}
```

**Step 3: Extract shared `buildConnectedRecord` helper**

Both methods build `connected` the same way. Extract to reduce duplication:

```typescript
private buildConnectedRecord(): Record<string, boolean> {
	const channels = this.channelMap.toRecord();
	const connected: Record<string, boolean> = {};
	for (const ptyId of Object.keys(channels)) {
		connected[ptyId] = this.terminals.has(ptyId);
	}
	return connected;
}
```

Use in both `buildStateMessage` and `broadcastLayoutUpdate`.

**Step 4: Typecheck**

Run: `turbo run typecheck --filter=worker`

Expected: Should pass for the worker package. Frontend still broken (next tasks).

**Step 5: Commit**

```
feat(sandbox): include connected status in state messages
```

---

### Task 3: Backend — terminal WS close handler

**Files:**
- Modify: `apps/worker/src/features/sandbox/WormholeServer.ts`

**Step 1: Rewrite close handler in `createTerminalWs`**

Replace the close handler (lines 492-506):

```typescript
ws.addEventListener("close", () => {
	this.terminals.delete(ptyId);
	// Keep outputBuffers — pane retains last visible output
	// Keep channel assigned — frontend can still send data to trigger reconnect
	// Broadcast layout update so clients see connected: false
	this.broadcastLayoutUpdate();
});
```

Key changes from before:
- **Remove** `this.outputBuffers.delete(ptyId)` — keep buffers
- **Remove** `SessionExitMessage` construction and broadcast
- **Remove** `this.channelMap.release(channel)` — keep channel
- **Add** `this.broadcastLayoutUpdate()` — notify clients of disconnection

**Step 2: Simplify error handler**

Update the error handler (lines 508-512) similarly:

```typescript
ws.addEventListener("error", () => {
	this.terminals.delete(ptyId);
	// Keep buffers and channel, same as close
	this.broadcastLayoutUpdate();
});
```

**Step 3: Typecheck**

Run: `turbo run typecheck --filter=worker`

Expected: PASS — no more reference to `SessionExitMessage`.

**Step 4: Commit**

```
fix(sandbox): keep buffers and channels on terminal disconnect
```

---

### Task 4: Backend — lazy reconnect on input

**Files:**
- Modify: `apps/worker/src/features/sandbox/WormholeServer.ts`

**Step 1: Add reconnect logic in `webSocketMessage`**

Replace the terminal input routing section (lines 97-103):

```typescript
// Route terminal input to CF terminal WS
const ptyId = this.channelMap.getPtyId(channel);
if (ptyId) {
	const termWs = this.terminals.get(ptyId);
	if (termWs) {
		termWs.send(payload);
	} else {
		// Terminal disconnected — lazy reconnect
		await this.reconnectTerminal(ptyId, payload);
	}
}
```

**Step 2: Implement `reconnectTerminal` method**

Add after `reconnectAllTerminals`:

```typescript
private async reconnectTerminal(ptyId: string, bufferedInput?: Uint8Array): Promise<void> {
	const sessionId = this.getSessionForPty(ptyId);
	if (!sessionId) return;
	const session = this.sessions.find((s) => s.id === sessionId);
	if (!session) return;

	await this.createTerminalWs(session.sandboxId, ptyId, 80, 24);

	// Send the keystroke that triggered the reconnect
	if (bufferedInput) {
		const termWs = this.terminals.get(ptyId);
		if (termWs) termWs.send(bufferedInput);
	}

	this.broadcastLayoutUpdate();
}
```

**Step 3: Typecheck**

Run: `turbo run typecheck --filter=worker`

Expected: PASS

**Step 4: Commit**

```
feat(sandbox): lazy reconnect terminal on user input
```

---

### Task 5: Frontend — track `connected` in state

**Files:**
- Modify: `apps/kamp-us/src/wormhole/use-wormhole-client.ts`

**Step 1: Add `paneConnected` to `WormholeClientState`**

Update the interface (line 26) — use `paneConnected` to avoid collision with the existing `connected` (WS connection status):

```typescript
interface WormholeClientState {
	sessions: SessionRecord[];
	tabs: TabRecord[];
	activeTab: string | null;
	channels: Record<string, number>;
	paneConnected: Record<string, boolean>;
	connected: boolean;
}
```

**Step 2: Initialize in useState**

Update initial state (line 58):

```typescript
const [state, setState] = useState<WormholeClientState>({
	sessions: [],
	tabs: [],
	activeTab: null,
	channels: {},
	paneConnected: {},
	connected: false,
});
```

**Step 3: Handle in `handleServerMessage`**

Update `state` case (line 123):

```typescript
case "state":
	setState((s) => ({
		...s,
		sessions: msg.sessions as SessionRecord[],
		tabs: msg.tabs as TabRecord[],
		activeTab: msg.activeTab,
		channels: msg.channels as Record<string, number>,
		paneConnected: msg.connected as Record<string, boolean>,
	}));
	break;
```

Update `layout_update` case (line 132):

```typescript
case "layout_update":
	setState((s) => ({
		...s,
		tabs: msg.tabs as TabRecord[],
		activeTab: msg.activeTab,
		channels: msg.channels as Record<string, number>,
		paneConnected: msg.connected as Record<string, boolean>,
	}));
	break;
```

**Step 4: Remove `session_exit` case**

Delete lines 140-141 (`case "session_exit": break;`). The `ServerMessage` union no longer includes it, so TypeScript will error if we leave it.

Also remove `sessions_reset` case (lines 142-143) if it's also unused — check if `SessionsResetMessage` is still in the union. (It is — keep it.)

Actually, `SessionsResetMessage` is still in the union, so keep that case. Just remove `session_exit`.

**Step 5: Typecheck**

Run: `turbo run typecheck --filter=kamp-us`

Expected: PASS for this file. `PaneLayout.tsx` and `TerminalPane.tsx` still need updates (next tasks).

**Step 6: Commit**

```
feat(sandbox): track pane connection status in frontend state
```

---

### Task 6: Frontend — pass `connected` through PaneLayout

**Files:**
- Modify: `apps/kamp-us/src/wormhole/PaneLayout.tsx`

**Step 1: Thread `paneConnected` through render functions**

Update `PaneLayout` to pass `state.paneConnected`:

```typescript
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
```

**Step 2: Update `renderChildren` signature**

```typescript
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
						className={stack.orientation === "horizontal" ? styles.resizeHandleH : styles.resizeHandleV}
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
```

**Step 3: Update `renderWindow` to pass connected**

```typescript
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
	const isConnected = paneConnected[window.key] ?? false;

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
```

**Step 4: Typecheck**

Run: `turbo run typecheck --filter=kamp-us`

Expected: FAIL — `TerminalPane` doesn't accept `connected` prop yet. Fixed in Task 7.

**Step 5: Commit**

```
feat(sandbox): thread pane connection status through layout
```

---

### Task 7: Frontend — disconnected overlay in TerminalPane

**Files:**
- Modify: `apps/kamp-us/src/wormhole/TerminalPane.tsx`
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.module.css`

**Step 1: Add `connected` prop and overlay to TerminalPane**

```typescript
interface TerminalPaneProps {
	channel: number;
	sessionId: string;
	focused: boolean;
	connected: boolean;
	onFocus: () => void;
	theme?: ITheme;
}

export function TerminalPane({channel, sessionId, focused, connected, onFocus, theme}: TerminalPaneProps) {
	const {ref} = useChannelTerminal({channel, sessionId, theme});
	const {splitPane, closePane} = useMux();

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: terminal handles keyboard events via ghostty-web
		// biome-ignore lint/a11y/noStaticElementInteractions: terminal container, not a button
		<div className={styles.pane} data-focused={focused || undefined} onClick={onFocus}>
			<div ref={ref} style={{flex: 1, minHeight: 0}} />
			{!connected && (
				<div className={styles.disconnectedOverlay}>
					<span>Disconnected — press any key to reconnect</span>
				</div>
			)}
			<div className={styles.paneControls}>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane(sessionId, "vertical", 80, 24);
					}}
					title="Split right"
				>
					|
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						splitPane(sessionId, "horizontal", 80, 24);
					}}
					title="Split down"
				>
					&mdash;
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						closePane(sessionId);
					}}
					title="Close pane"
				>
					&times;
				</button>
			</div>
		</div>
	);
}
```

**Step 2: Add overlay CSS**

Append to `WormholeLayout.module.css`:

```css
.disconnectedOverlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.6);
	z-index: 5;
}

.disconnectedOverlay span {
	color: #888;
	font-size: 13px;
	font-family: monospace;
}
```

**Step 3: Typecheck all**

Run: `turbo run typecheck`

Expected: PASS across all packages.

**Step 4: Commit**

```
feat(sandbox): show disconnected overlay on stale terminal panes
```

---

### Task 8: Final verification

**Step 1: Full typecheck**

Run: `turbo run typecheck`

Expected: PASS

**Step 2: Biome lint**

Run: `biome check --write apps/worker/src/features/sandbox/WormholeServer.ts apps/kamp-us/src/wormhole/use-wormhole-client.ts apps/kamp-us/src/wormhole/PaneLayout.tsx apps/kamp-us/src/wormhole/TerminalPane.tsx apps/kamp-us/src/wormhole/WormholeLayout.module.css packages/sandbox/src/Protocol.ts`

Expected: PASS or auto-fix

**Step 3: Update design doc**

Update `docs/plans/2026-02-15-stale-session-design.md` to reflect final decision: channels are NOT released on disconnect (design doc currently says "Release the channel"). Fix the Data Flow section too.

**Step 4: Commit**

```
docs: update stale session design to match implementation
```
