import {DurableObject} from "cloudflare:workers";
import {ChannelMap} from "@kampus/sandbox/ChannelMap";
import * as TL from "@kampus/sandbox/TabbedLayout";
import * as Protocol from "@kampus/sandbox/Protocol";
import * as LT from "@usirin/layout-tree";

interface SessionRecord {
	id: string;
	sandboxId: string;
	name: string;
	createdAt: number;
}

interface PersistedState {
	sessions: SessionRecord[];
	tabs: TL.Tab[];
	activeTab: number;
	tabToSession: Record<string, string>;
}

export class WormholeServer extends DurableObject {
	private static MAX_BUFFER_SIZE = 64 * 1024; // 64KB per pty

	private sessions: SessionRecord[] = [];
	private layout: TL.TabbedLayout | null = null;
	private channelMap = new ChannelMap();
	private clients = new Set<WebSocket>();
	private terminals = new Map<string, WebSocket>();
	private tabToSession = new Map<string, string>();
	private outputBuffers = new Map<string, Uint8Array[]>();

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.ctx.blockConcurrencyWhile(async () => {
			await this.hydrate();
		});
	}

	// --- Persistence ---

	private async hydrate(): Promise<void> {
		const stored = await this.ctx.storage.get<PersistedState>("state");
		if (stored) {
			this.sessions = stored.sessions;
			this.layout = {tabs: stored.tabs, activeTab: stored.activeTab};
			if (stored.tabToSession) {
				this.tabToSession = new Map(Object.entries(stored.tabToSession));
			}
		}
	}

	private async persist(): Promise<void> {
		if (!this.layout) return;
		const state: PersistedState = {
			sessions: this.sessions,
			tabs: this.layout.tabs,
			activeTab: this.layout.activeTab,
			tabToSession: Object.fromEntries(this.tabToSession),
		};
		await this.ctx.storage.put("state", state);
	}

	// --- WebSocket handling (hibernation API) ---

	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		if (upgradeHeader !== "websocket") {
			return new Response("Expected WebSocket", {status: 426});
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		this.clients.add(server);

		// Send current state to new client
		if (this.layout) {
			const stateMsg = this.buildStateMessage();
			server.send(Protocol.encodeControlMessage(stateMsg));
		}

		return new Response(null, {status: 101, webSocket: client});
	}

	async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string): Promise<void> {
		if (typeof data === "string") return;
		const bytes = new Uint8Array(data);
		const {channel, payload} = Protocol.parseBinaryFrame(bytes);

		if (channel === Protocol.CONTROL_CHANNEL) {
			const msg = Protocol.decodeControlMessage(payload);
			await this.handleControlMessage(ws, msg);
			return;
		}

		// Route terminal input to CF terminal WS
		const ptyId = this.channelMap.getPtyId(channel);
		if (ptyId) {
			const termWs = this.terminals.get(ptyId);
			if (termWs) termWs.send(payload);
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		this.clients.delete(ws);
		if (this.clients.size === 0) {
			await this.persist();
		}
	}

	// --- Control message dispatch ---

	private async handleControlMessage(ws: WebSocket, msg: Protocol.ClientMessage): Promise<void> {
		switch (msg.type) {
			case "connect":
				return this.handleConnect(ws, msg);
			case "session_create":
				return this.handleSessionCreate(msg);
			case "session_destroy":
				return this.handleSessionDestroy(msg);
			case "session_rename":
				return this.handleSessionRename(msg);
			case "tab_create":
				return this.handleTabCreate(msg);
			case "tab_close":
				return this.handleTabClose(msg);
			case "tab_rename":
				return this.handleTabRename(msg);
			case "tab_switch":
				return this.handleTabSwitch(msg);
			case "pane_split":
				return this.handlePaneSplit(msg);
			case "pane_close":
				return this.handlePaneClose(msg);
			case "pane_resize":
				return this.handlePaneResize(msg);
			case "pane_focus":
				return this.handlePaneFocus(msg);
		}
	}

	// --- Handlers (stubs — filled in Task 8) ---

	private async handleConnect(ws: WebSocket, _msg: Protocol.ConnectMessage): Promise<void> {
		await this.reconnectAllTerminals();
		this.replayBuffers(ws);
		this.broadcastState();
	}

	private async handleSessionCreate(msg: Protocol.SessionCreateMessage): Promise<void> {
		const sessionId = crypto.randomUUID();
		const sandboxId = sessionId; // 1:1 mapping for now

		const session: SessionRecord = {
			id: sessionId,
			sandboxId,
			name: msg.name,
			createdAt: Date.now(),
		};
		this.sessions.push(session);

		// Create first terminal
		const ptyId = crypto.randomUUID();
		await this.createTerminalWs(sandboxId, ptyId, 80, 24);

		// Create layout with one tab + one pane
		if (!this.layout) {
			this.layout = TL.createTabbedLayout(msg.name, ptyId);
		} else {
			this.layout = TL.createTab(this.layout, msg.name, ptyId);
		}

		// Track tab→session
		const activeTab = TL.getActiveTab(this.layout);
		if (activeTab) {
			this.tabToSession.set(activeTab.id, sessionId);
		}

		await this.persist();
		this.broadcastState();
	}

	private async handleSessionDestroy(msg: Protocol.SessionDestroyMessage): Promise<void> {
		const sessionIndex = this.sessions.findIndex((s) => s.id === msg.sessionId);
		if (sessionIndex === -1) return;

		// Close all terminals for this session's tabs
		if (this.layout) {
			const tabsToRemove = [...this.tabToSession.entries()]
				.filter(([, sid]) => sid === msg.sessionId)
				.map(([tabId]) => tabId);

			for (const tabId of tabsToRemove) {
				const tabIndex = this.layout.tabs.findIndex((t) => t.id === tabId);
				if (tabIndex === -1) continue;

				// Release channels + close terminal WSes for all panes in this tab
				const keys = this.windowKeysForTab(this.layout.tabs[tabIndex]);
				for (const key of keys) {
					const channel = this.channelMap.getChannel(key);
					if (channel !== null) this.channelMap.release(channel);
					const termWs = this.terminals.get(key);
					if (termWs) {
						try {
							termWs.close();
						} catch {
							/* already closed */
						}
						this.terminals.delete(key);
					}
				}

				const result = TL.closeTab(this.layout, tabIndex);
				if (result) this.layout = result;
				this.tabToSession.delete(tabId);
			}
		}

		this.sessions.splice(sessionIndex, 1);
		await this.persist();
		this.broadcastState();
	}

	private async handleSessionRename(msg: Protocol.SessionRenameMessage): Promise<void> {
		const session = this.sessions.find((s) => s.id === msg.sessionId);
		if (session) session.name = msg.name;
		await this.persist();
		this.broadcastState();
	}

	private async handleTabCreate(msg: Protocol.TabCreateMessage): Promise<void> {
		if (!this.layout) return;

		const session = this.sessions.find((s) => s.id === msg.sessionId);
		if (!session) return;

		const ptyId = crypto.randomUUID();
		await this.createTerminalWs(session.sandboxId, ptyId, 80, 24);

		this.layout = TL.createTab(this.layout, msg.name, ptyId);

		const activeTab = TL.getActiveTab(this.layout);
		if (activeTab) {
			this.tabToSession.set(activeTab.id, msg.sessionId);
		}

		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handleTabClose(msg: Protocol.TabCloseMessage): Promise<void> {
		if (!this.layout) return;
		if (this.layout.tabs.length <= 1) return; // Don't close last tab

		const tabIndex = this.layout.tabs.findIndex((t) => t.id === msg.tabId);
		if (tabIndex === -1) return;

		const keys = this.windowKeysForTab(this.layout.tabs[tabIndex]);
		for (const key of keys) {
			const channel = this.channelMap.getChannel(key);
			if (channel !== null) this.channelMap.release(channel);
			const termWs = this.terminals.get(key);
			if (termWs) {
				try {
					termWs.close();
				} catch {
					/* already closed */
				}
				this.terminals.delete(key);
			}
		}

		const result = TL.closeTab(this.layout, tabIndex);
		if (result) this.layout = result;
		this.tabToSession.delete(msg.tabId);

		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handleTabRename(msg: Protocol.TabRenameMessage): Promise<void> {
		if (!this.layout) return;
		const tabIndex = this.layout.tabs.findIndex((t) => t.id === msg.tabId);
		if (tabIndex === -1) return;
		this.layout = TL.renameTab(this.layout, tabIndex, msg.name);
		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handleTabSwitch(msg: Protocol.TabSwitchMessage): Promise<void> {
		if (!this.layout) return;
		const tabIndex = this.layout.tabs.findIndex((t) => t.id === msg.tabId);
		if (tabIndex === -1) return;
		this.layout = TL.switchTab(this.layout, tabIndex);
		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handlePaneSplit(msg: Protocol.PaneSplitMessage): Promise<void> {
		if (!this.layout) return;

		const activeTab = TL.getActiveTab(this.layout);
		if (!activeTab) return;

		const sessionId = this.tabToSession.get(activeTab.id);
		if (!sessionId) return;
		const session = this.sessions.find((s) => s.id === sessionId);
		if (!session) return;

		const ptyId = crypto.randomUUID();
		await this.createTerminalWs(session.sandboxId, ptyId, msg.cols, msg.rows);

		const result = TL.splitPane(this.layout, msg.paneId, msg.orientation, ptyId);
		this.layout = result.layout;

		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handlePaneClose(msg: Protocol.PaneCloseMessage): Promise<void> {
		if (!this.layout) return;

		const channel = this.channelMap.getChannel(msg.paneId);
		if (channel !== null) this.channelMap.release(channel);

		const termWs = this.terminals.get(msg.paneId);
		if (termWs) {
			try {
				termWs.close();
			} catch {
				/* already closed */
			}
			this.terminals.delete(msg.paneId);
		}

		// Find the path for this pane key in the active tab's tree
		const activeTab = TL.getActiveTab(this.layout);
		if (!activeTab) return;

		const window = LT.find(activeTab.tree, (w) => w.key === msg.paneId);
		if (!window) return;

		const path = LT.findWindowPath(activeTab.tree, window);
		if (!path) return;

		const result = TL.closePane(this.layout, path);
		if (result) this.layout = result;

		await this.persist();
		this.broadcastLayoutUpdate();
	}

	private async handlePaneResize(msg: Protocol.PaneResizeMessage): Promise<void> {
		const termWs = this.terminals.get(msg.paneId);
		if (!termWs) return;
		termWs.send(JSON.stringify({type: "resize", cols: msg.cols, rows: msg.rows}));
	}

	private async handlePaneFocus(msg: Protocol.PaneFocusMessage): Promise<void> {
		if (!this.layout) return;
		this.layout = TL.moveFocus(this.layout, msg.direction);
		await this.persist();
		this.broadcastLayoutUpdate();
	}

	// --- Broadcast helpers ---

	private buildStateMessage(): Protocol.StateMessage {
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
			channels: this.channelMap.toRecord(),
		});
	}

	private broadcastState(): void {
		const msg = this.buildStateMessage();
		const encoded = Protocol.encodeControlMessage(msg);
		for (const ws of this.clients) {
			ws.send(encoded);
		}
	}

	private broadcastLayoutUpdate(): void {
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
			channels: this.channelMap.toRecord(),
		});
		const encoded = Protocol.encodeControlMessage(msg);
		for (const ws of this.clients) {
			ws.send(encoded);
		}
	}

	private getSessionIdForTab(tabId: string): string {
		return this.tabToSession.get(tabId) ?? "";
	}

	private getSessionForPty(ptyId: string): string {
		if (!this.layout) return "";
		for (const [tabId, sessionId] of this.tabToSession) {
			const tab = this.layout.tabs.find((t) => t.id === tabId);
			if (!tab) continue;
			const keys = this.windowKeysForTab(tab);
			if (keys.includes(ptyId)) return sessionId;
		}
		return "";
	}

	/** Collect all window keys for a single tab. */
	private windowKeysForTab(tab: TL.Tab): string[] {
		const keys: string[] = [];
		function walk(node: LT.Window | LT.Stack) {
			if (node.tag === "window") {
				keys.push((node as LT.Window).key);
			} else {
				(node as LT.Stack).children.forEach(walk);
			}
		}
		walk(tab.tree.root);
		return keys;
	}

	private async createTerminalWs(sandboxId: string, ptyId: string, cols: number, rows: number): Promise<void> {
		const id = this.env.SANDBOX.idFromName(sandboxId);
		const stub = this.env.SANDBOX.get(id);

		const params = new URLSearchParams({sessionId: ptyId});
		params.set("cols", String(cols));
		params.set("rows", String(rows));
		const req = new Request(`http://localhost:3000/ws/pty?${params}`, {
			headers: new Headers({Upgrade: "websocket", Connection: "Upgrade"}),
		});

		const resp = await stub.fetch(req);
		const ws = resp.webSocket;
		if (!ws) {
			console.log("[WormholeServer] createTerminalWs: no webSocket in response", resp.status);
			return;
		}
		ws.accept();
		console.log("[WormholeServer] createTerminalWs: terminal connected", {ptyId, sandboxId});

		this.terminals.set(ptyId, ws);

		// Assign channel and bridge output
		const channel = this.channelMap.assign(ptyId);
		if (channel === null) {
			// No channels available — close the terminal WS to avoid resource leak
			ws.close();
			this.terminals.delete(ptyId);
			return;
		}

		// Bridge terminal output → all clients
		// String messages from the container are control protocol (e.g. {"type":"ready"}),
		// not terminal output. Only forward binary (ArrayBuffer) data.
		ws.addEventListener("message", (evt: MessageEvent) => {
			if (!(evt.data instanceof ArrayBuffer)) return;
			const data = new Uint8Array(evt.data);
			this.appendToBuffer(ptyId, data);
			const frame = Protocol.encodeBinaryFrame(channel, data);
			for (const client of this.clients) {
				client.send(frame);
			}
		});

		ws.addEventListener("close", () => {
			this.terminals.delete(ptyId);
			this.outputBuffers.delete(ptyId);
			const exitMsg = new Protocol.SessionExitMessage({
				type: "session_exit",
				sessionId: this.getSessionForPty(ptyId),
				ptyId,
				channel,
				exitCode: 0,
			});
			const encoded = Protocol.encodeControlMessage(exitMsg);
			for (const client of this.clients) {
				client.send(encoded);
			}
		});

		ws.addEventListener("error", () => {
			this.terminals.delete(ptyId);
			this.outputBuffers.delete(ptyId);
			this.channelMap.release(channel);
		});
	}

	private appendToBuffer(ptyId: string, data: Uint8Array): void {
		let chunks = this.outputBuffers.get(ptyId);
		if (!chunks) {
			chunks = [];
			this.outputBuffers.set(ptyId, chunks);
		}
		chunks.push(new Uint8Array(data));

		let total = 0;
		for (const c of chunks) total += c.byteLength;
		while (total > WormholeServer.MAX_BUFFER_SIZE && chunks.length > 0) {
			total -= chunks.shift()!.byteLength;
		}
	}

	private replayBuffers(ws: WebSocket): void {
		for (const [ptyId, chunks] of this.outputBuffers) {
			const channel = this.channelMap.getChannel(ptyId);
			if (channel === null) continue;
			for (const chunk of chunks) {
				ws.send(Protocol.encodeBinaryFrame(channel, chunk));
			}
		}
	}

	private async reconnectAllTerminals(): Promise<void> {
		if (!this.layout) return;

		for (const session of this.sessions) {
			// Collect all ptyIds across tabs belonging to this session
			for (const [tabId, sid] of this.tabToSession) {
				if (sid !== session.id) continue;
				const tab = this.layout.tabs.find((t) => t.id === tabId);
				if (!tab) continue;

				const keys = this.windowKeysForTab(tab);
				for (const ptyId of keys) {
					if (!this.terminals.has(ptyId)) {
						await this.createTerminalWs(session.sandboxId, ptyId, 80, 24);
					}
				}
			}
		}
	}
}
