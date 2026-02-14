# Session Resurrection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sessions survive PTY death — on reattach, replay scrollback then spawn fresh PTY (like tmux's `remain-on-exit` + `respawn-pane`).

**Architecture:** Decouple session identity from PTY lifetime. Session stores a `Ref<PtyProcess | null>` and per-generation `Deferred`. When PTY exits, session stays alive with its RingBuffer. On reattach to dead session, server auto-respawns PTY. Client reattaches all sessions on reconnect.

**Tech Stack:** Effect.ts (Ref, Deferred, Scope, Stream), vitest, @effect/vitest

---

### Task 1: Add `respawn` and `isExited` to Session interface

**Files:**
- Modify: `packages/wormhole/src/Session.ts`

**Step 1: Add new fields to Session interface**

```typescript
export interface Session {
	readonly id: string;
	readonly clientCount: Effect.Effect<number>;
	readonly exited: Deferred.Deferred<number>;
	readonly isExited: Effect.Effect<boolean>;
	readonly attach: (clientId: string, cols: number, rows: number) => Effect.Effect<ClientHandle>;
	readonly write: (data: string) => Effect.Effect<void>;
	readonly clientResize: (clientId: string, cols: number, rows: number) => Effect.Effect<void>;
	readonly respawn: (cols: number, rows: number) => Effect.Effect<void, PtySpawnError>;
}
```

Add `PtySpawnError` to imports from `./Errors.ts`.

Note: `exited` stays but its semantics shift — it now represents the *current* generation's exit. We keep it for backward compat with the non-mux server path.

**Step 2: Verify typecheck fails**

Run: `pnpm turbo run typecheck --filter=@kampus/wormhole 2>&1 | tail -20`
Expected: FAIL — `internal/session.ts` `make` returns object missing `isExited` and `respawn`

**Step 3: Commit**

```bash
git add packages/wormhole/src/Session.ts
git commit -m "feat(wormhole): add respawn and isExited to Session interface"
```

---

### Task 2: Refactor session internals for respawnable PTY

**Files:**
- Modify: `packages/wormhole/src/internal/session.ts`

This is the core change. Replace the single `PtyProcess` with a `Ref`-based multi-generation model.

**Step 1: Refactor `make` to use procRef + exitedRef + spawnGeneration**

Replace the entire `make` function body. Key changes:

1. `procRef = Ref.make<PtyProcess | null>(null)` — current PTY (null when dead)
2. `exitedRef = Ref.make<Deferred<number>>(initialDeferred)` — current generation's exit deferred
3. `sessionScope = yield* Effect.scope` — capture scope for forking fibers on respawn
4. Extract `spawnGeneration(cols, rows)` that:
   - Spawns PTY (provided with captured `pty` and `sessionScope`)
   - Creates fresh Deferred, sets `exitedRef`
   - Sets `procRef` to new process
   - Forks distribution fiber in `sessionScope` (PTY output → buffer + client queues)
   - Forks exit watcher fiber in `sessionScope` that: resolves deferred, shuts down queues, sets `procRef` to `null`
5. `write` reads `procRef` — no-op if null
6. `recomputeSize` reads `procRef` — no-op if null
7. `attach` captures current deferred via `Ref.get(exitedRef)` for `ClientHandle.exited`
8. `respawn`: pushes separator into buffer, calls `spawnGeneration`

```typescript
export const make = (
	options: MakeOptions,
): Effect.Effect<Session, PtySpawnError, Pty | Scope.Scope> =>
	Effect.gen(function* () {
		const pty = yield* Pty;
		const sessionScope = yield* Effect.scope;

		const buffer = new RingBuffer(options.bufferCapacity ?? DEFAULT_BUFFER_CAPACITY);
		const clients = yield* Ref.make<Map<string, ClientEntry>>(new Map());
		const procRef = yield* Ref.make<PtyProcess | null>(null);
		const exitedRef = yield* Ref.make(yield* Deferred.make<number>());

		const recomputeSize = Effect.gen(function* () {
			const proc = yield* Ref.get(procRef);
			if (!proc) return;
			const map = yield* Ref.get(clients);
			if (map.size === 0) return;
			let minCols = Number.POSITIVE_INFINITY;
			let minRows = Number.POSITIVE_INFINITY;
			for (const entry of map.values()) {
				if (entry.cols < minCols) minCols = entry.cols;
				if (entry.rows < minRows) minRows = entry.rows;
			}
			yield* proc.resize(minCols, minRows);
		});

		const spawnGeneration = (cols: number, rows: number) =>
			Effect.gen(function* () {
				const proc = yield* pty
					.spawn({cols, rows})
					.pipe(Effect.provideService(Scope.Scope, sessionScope));

				const generationExited = yield* Deferred.make<number>();
				yield* Ref.set(procRef, proc);
				yield* Ref.set(exitedRef, generationExited);

				// Distribution fiber: PTY output -> buffer + all client queues
				yield* proc.output.pipe(
					Stream.runForEach((data) =>
						Effect.gen(function* () {
							buffer.push(data);
							const map = yield* Ref.get(clients);
							yield* Effect.forEach(
								map.values(),
								(entry) => Queue.offer(entry.queue, data),
								{concurrency: "unbounded", discard: true},
							);
						}),
					),
					Effect.forkIn(sessionScope),
				);

				// Exit watcher fiber: PTY exit -> resolve deferred + shutdown queues + clear proc
				yield* proc.awaitExit.pipe(
					Effect.tap((code) => Deferred.succeed(generationExited, code)),
					Effect.tap(() => Ref.set(procRef, null)),
					Effect.tap(() =>
						Effect.gen(function* () {
							const map = yield* Ref.get(clients);
							yield* Effect.forEach(
								map.values(),
								(entry) => Queue.shutdown(entry.queue),
								{concurrency: "unbounded", discard: true},
							);
						}),
					),
					Effect.forkIn(sessionScope),
				);
			});

		// Spawn initial PTY
		yield* spawnGeneration(options.cols, options.rows);

		const attach = (clientId: string, cols: number, rows: number): Effect.Effect<ClientHandle> =>
			Effect.gen(function* () {
				const queue = yield* Queue.unbounded<string>();

				for (const entry of buffer.snapshot()) {
					yield* Queue.offer(queue, entry);
				}

				yield* Ref.update(clients, (map) => {
					const next = new Map(map);
					next.set(clientId, {queue, cols, rows});
					return next;
				});
				yield* recomputeSize;

				const output = Stream.fromQueue(queue);
				const currentExited = yield* Ref.get(exitedRef);

				const close = Effect.gen(function* () {
					yield* Queue.shutdown(queue);
					yield* Ref.update(clients, (map) => {
						const next = new Map(map);
						next.delete(clientId);
						return next;
					});
					yield* recomputeSize;
				});

				return {output, exited: currentExited, close} satisfies ClientHandle;
			});

		const clientResize = (clientId: string, cols: number, rows: number): Effect.Effect<void> =>
			Effect.gen(function* () {
				yield* Ref.update(clients, (map) => {
					const entry = map.get(clientId);
					if (!entry) return map;
					const next = new Map(map);
					next.set(clientId, {...entry, cols, rows});
					return next;
				});
				yield* recomputeSize;
			});

		const initialExited = yield* Ref.get(exitedRef);

		return {
			id: options.id,
			clientCount: Ref.get(clients).pipe(Effect.map((map) => map.size)),
			exited: initialExited,
			isExited: Ref.get(procRef).pipe(Effect.map((p) => p === null)),
			attach,
			write: (data) =>
				Effect.gen(function* () {
					const proc = yield* Ref.get(procRef);
					if (proc) yield* proc.write(data);
				}),
			clientResize,
			respawn: (cols, rows) =>
				Effect.gen(function* () {
					buffer.push("\r\n\x1b[33m--- shell restarted ---\x1b[0m\r\n");
					yield* spawnGeneration(cols, rows);
				}),
		} satisfies Session;
	});
```

Add `Scope` to the import from `effect` (it's already imported as `type Scope`; change to regular import).

**Step 2: Run typecheck**

Run: `pnpm turbo run typecheck --filter=@kampus/wormhole 2>&1 | tail -20`
Expected: PASS (session now satisfies updated interface)

**Step 3: Run existing tests**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -30`
Expected: PASS — existing behavior preserved (initial spawn still works, exit still works)

**Step 4: Commit**

```bash
git add packages/wormhole/src/internal/session.ts
git commit -m "refactor(wormhole): make session respawnable with procRef + spawnGeneration"
```

---

### Task 3: Remove auto-cleanup from SessionStore, add destroy

**Files:**
- Modify: `packages/wormhole/src/internal/sessionStore.ts`

**Step 1: Delete auto-cleanup fiber (lines 40-51)**

Remove:
```typescript
// Auto-cleanup on PTY exit
yield* Deferred.await(session.exited).pipe(
	Effect.andThen(
		Ref.update(entries, (map) => {
			const next = new Map(map);
			next.delete(id);
			return next;
		}),
	),
	Effect.andThen(Scope.close(sessionScope, Exit.void)),
	Effect.fork,
);
```

**Step 2: Add `destroy` method**

```typescript
const destroy = (id: string) =>
	Effect.gen(function* () {
		const map = yield* Ref.get(entries);
		const entry = map.get(id);
		if (!entry) return;
		yield* Ref.update(entries, (m) => {
			const next = new Map(m);
			next.delete(id);
			return next;
		});
		yield* Scope.close(entry.scope, Exit.void);
	});
```

**Step 3: Export `destroy` in return**

```typescript
return {create, get, getOrFail, list: () => list, size, destroy};
```

Remove unused `Exit` import if `Deferred.await` was the only usage. Actually `Exit` is still used in `Scope.close` — keep it. Remove unused `Deferred` import.

**Step 4: Run tests**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -30`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/wormhole/src/internal/sessionStore.ts
git commit -m "refactor(wormhole): remove auto-cleanup, add destroy to SessionStore"
```

---

### Task 4: Add SessionDestroyRequest to protocol

**Files:**
- Modify: `packages/wormhole/src/Protocol.ts`
- Modify: `packages/wormhole/test/Protocol.test.ts`

**Step 1: Write failing test**

In `Protocol.test.ts`, add to `parseMessage` describe block:

```typescript
test("parses session_destroy", () => {
	const msg = JSON.stringify({type: "session_destroy", sessionId: "s1"});
	const result = parseMessage(msg);
	expect(Option.isSome(result)).toBe(true);
	if (Option.isSome(result)) expect(result.value.type).toBe("session_destroy");
});
```

And add to `server messages` describe block:

```typescript
test("SessionDestroyRequest constructs correctly", () => {
	const msg = new SessionDestroyRequest({type: "session_destroy", sessionId: "s1"});
	expect(msg.type).toBe("session_destroy");
	expect(msg.sessionId).toBe("s1");
});
```

Import `SessionDestroyRequest` in the test file's import.

**Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -20`
Expected: FAIL — `SessionDestroyRequest` not exported

**Step 3: Add SessionDestroyRequest to Protocol.ts**

After `SessionResizeRequest`, add:

```typescript
/** @since 0.0.2 @category models */
export class SessionDestroyRequest extends Schema.Class<SessionDestroyRequest>(
	"SessionDestroyRequest",
)({
	type: Schema.Literal("session_destroy"),
	sessionId: Schema.String,
}) {}
```

Add to `ControlMessage` union:

```typescript
export const ControlMessage = Schema.Union(
	AttachMessage,
	ResizeMessage,
	SessionListRequest,
	SessionNewRequest,
	SessionCreateRequest,
	SessionAttachRequest,
	SessionDetachRequest,
	SessionResizeRequest,
	SessionDestroyRequest,
);
```

**Step 4: Run tests**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/wormhole/src/Protocol.ts packages/wormhole/test/Protocol.test.ts
git commit -m "feat(wormhole): add SessionDestroyRequest to protocol"
```

---

### Task 5: Handle exited sessions in muxServer

**Files:**
- Modify: `packages/wormhole/src/internal/muxServer.ts`

**Step 1: Add respawn logic to `session_attach` case**

Replace lines 88-90 (`case "session_attach"` opening):

```typescript
case "session_attach": {
	const existing = yield* store.get(msg.sessionId);
	if (!existing) return;

	// Respawn dead session before attaching
	const exited = yield* existing.isExited;
	if (exited) {
		yield* existing.respawn(msg.cols, msg.rows);
	}

	// ... rest unchanged
```

**Step 2: Add `session_destroy` case**

Before the `default:` case:

```typescript
case "session_destroy": {
	const channelOpt = channelMap.getChannel(msg.sessionId);
	if (Option.isSome(channelOpt)) {
		const channel = channelOpt.value;
		const entry = entries.get(channel);
		if (entry) {
			yield* entry.handle.close;
			yield* Fiber.interrupt(entry.outputFiber);
			entries.delete(channel);
			yield* channelMap.release(channel);
		}
	}
	yield* store.destroy(msg.sessionId);
	return;
}
```

**Step 3: Run typecheck**

Run: `pnpm turbo run typecheck --filter=@kampus/wormhole 2>&1 | tail -20`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/wormhole/src/internal/muxServer.ts
git commit -m "feat(wormhole): handle exited sessions in mux attach, add session_destroy"
```

---

### Task 6: Write resurrection tests

**Files:**
- Modify: `packages/wormhole/test/Server.test.ts`

The mock PTY's `controlsRef` gets overwritten on each `spawn()` call — this naturally supports multi-generation testing. After respawn, `Ref.get(controlsRef)` returns the NEW generation's controls.

**Step 1: Write test — session persists after PTY exit**

```typescript
it.effect("session persists in store after PTY exit", () =>
	Effect.gen(function* () {
		const controlsRef = yield* Ref.make<PtyControls | null>(null);
		const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

		const fiber = yield* handleMuxConnection(socket).pipe(
			Effect.provide(makeTestLayers(controlsRef)),
			Effect.fork,
		);

		yield* sendControl({type: "session_create", cols: 80, rows: 24});
		const created = yield* receiveControl;

		const controls = yield* Ref.get(controlsRef);
		yield* controls!.triggerExit(0);
		yield* receiveControl; // consume session_exit

		// Session should still be attachable (not deleted)
		yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
		const reattached = yield* receiveControl;
		expect(reattached.type).toBe("session_created");
		expect(reattached.sessionId).toBe(created.sessionId);

		yield* close;
		yield* Fiber.join(fiber);
	}),
);
```

**Step 2: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -30`
Expected: PASS — session_attach auto-respawns dead session

**Step 3: Write test — new PTY I/O works after respawn**

```typescript
it.effect("reattach to exited session respawns PTY with working I/O", () =>
	Effect.gen(function* () {
		const controlsRef = yield* Ref.make<PtyControls | null>(null);
		const {socket, sendControl, sendData, receiveControl, receiveData, close} =
			yield* makeMuxMockSocket;

		const fiber = yield* handleMuxConnection(socket).pipe(
			Effect.provide(makeTestLayers(controlsRef)),
			Effect.fork,
		);

		// Create and kill session
		yield* sendControl({type: "session_create", cols: 80, rows: 24});
		const created = yield* receiveControl;
		const oldControls = yield* Ref.get(controlsRef);
		yield* oldControls!.triggerExit(0);
		yield* receiveControl; // consume session_exit

		// Reattach — triggers respawn
		yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
		const reattached = yield* receiveControl;

		// Drain scrollback replay (buffer content + restart separator)
		// The reattached channel may differ from original
		const channel = reattached.channel;

		// New PTY should work
		const newControls = yield* Ref.get(controlsRef);
		expect(newControls).not.toBe(oldControls); // new generation

		yield* newControls!.emitOutput("new shell output");
		const data = yield* receiveData;
		expect(data.channel).toBe(channel);
		expect(new TextDecoder().decode(data.payload)).toBe("new shell output");

		yield* sendData(channel, "echo hello");
		const input = yield* newControls!.getInput;
		expect(input).toBe("echo hello");

		yield* close;
		yield* Fiber.join(fiber);
	}),
);
```

**Step 4: Write test — scrollback replayed on reattach**

```typescript
it.effect("scrollback including restart separator replayed on reattach", () =>
	Effect.gen(function* () {
		const controlsRef = yield* Ref.make<PtyControls | null>(null);
		const {socket, sendControl, receiveControl, receiveData, close} = yield* makeMuxMockSocket;

		const fiber = yield* handleMuxConnection(socket).pipe(
			Effect.provide(makeTestLayers(controlsRef)),
			Effect.fork,
		);

		// Create session + emit some output
		yield* sendControl({type: "session_create", cols: 80, rows: 24});
		const created = yield* receiveControl;

		const controls = yield* Ref.get(controlsRef);
		yield* controls!.emitOutput("line one\r\n");
		yield* receiveData; // drain original output from channel

		// Kill PTY
		yield* controls!.triggerExit(0);
		yield* receiveControl; // consume session_exit

		// Reattach — should replay scrollback
		yield* sendControl({type: "session_attach", sessionId: created.sessionId, cols: 80, rows: 24});
		yield* receiveControl; // consume session_created

		// First replay chunk: original output
		const replay1 = yield* receiveData;
		expect(new TextDecoder().decode(replay1.payload)).toBe("line one\r\n");

		// Second replay chunk: restart separator
		const replay2 = yield* receiveData;
		expect(new TextDecoder().decode(replay2.payload)).toContain("shell restarted");

		yield* close;
		yield* Fiber.join(fiber);
	}),
);
```

**Step 5: Write test — session_destroy removes session**

```typescript
it.effect("session_destroy removes session from store", () =>
	Effect.gen(function* () {
		const controlsRef = yield* Ref.make<PtyControls | null>(null);
		const {socket, sendControl, receiveControl, close} = yield* makeMuxMockSocket;

		const fiber = yield* handleMuxConnection(socket).pipe(
			Effect.provide(makeTestLayers(controlsRef)),
			Effect.fork,
		);

		yield* sendControl({type: "session_create", cols: 80, rows: 24});
		const created = yield* receiveControl;

		// Destroy session
		yield* sendControl({type: "session_destroy", sessionId: created.sessionId});

		// Trying to attach should silently fail (no response)
		// Verify via session_list instead
		yield* sendControl({type: "session_list_request"});
		const list = yield* receiveControl;
		expect(list.type).toBe("session_list");
		expect(list.sessions.length).toBe(0);

		yield* close;
		yield* Fiber.join(fiber);
	}),
);
```

**Step 6: Run all tests**

Run: `pnpm turbo run test --filter=@kampus/wormhole 2>&1 | tail -30`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/wormhole/test/Server.test.ts
git commit -m "test(wormhole): add session resurrection and destroy tests"
```

---

### Task 7: Client-side reconnection — layout reattach

**Files:**
- Modify: `apps/kamp-us/src/wormhole/use-wormhole-layout.ts`
- Modify: `apps/kamp-us/src/wormhole/WormholeLayout.tsx`

**Step 1: Update `onSessionCreated` to handle reattach in `use-wormhole-layout.ts`**

In the `onSessionCreated` listener, check if sessionId already exists in paneMap (reattach case = channel update only, no tree change):

```typescript
useEffect(() => {
	return gateway.onSessionCreated((event: SessionCreatedEvent) => {
		const {sessionId, channel} = event;

		// Reattach — just update channel, don't modify tree
		const existing = paneMap.current.get(sessionId);
		if (existing) {
			paneMap.current.set(sessionId, {sessionId, channel});
			return;
		}

		// New session — existing logic
		paneMap.current.set(sessionId, {sessionId, channel});
		setTree((prev) => {
			if (prev.root.children.length === 0) {
				const window = LT.createWindow(sessionId);
				return LT.createTree(LT.createStack("vertical", [window]));
			}
			if (pendingSplitRef.current) {
				const orientation = pendingSplitRef.current.orientation;
				pendingSplitRef.current = null;
				const updated = LT.split(prev, focused, orientation);
				const newPath = [...focused.slice(0, -1), (focused[focused.length - 1] ?? 0) + 1];
				return LT.updateWindow(updated, newPath, sessionId);
			}
			return prev;
		});
	});
}, [gateway, focused]);
```

**Step 2: Add `reattachAll` to the hook's return**

```typescript
const reattachAll = useCallback(
	(cols: number, rows: number) => {
		for (const [, info] of paneMap.current) {
			gateway.attachSession(info.sessionId, cols, rows);
		}
	},
	[gateway],
);
```

Add `reattachAll` to the return object.

**Step 3: Update `WormholeLayout.tsx` to use reattach on reconnect**

Replace the initialization `useEffect`:

```typescript
useEffect(() => {
	if (gateway.status !== "connected") return;

	// Reconnect: reattach all existing sessions
	if (paneMap.current.size > 0) {
		layout.reattachAll(80, 24);
		return;
	}

	// First connect: create initial session
	if (initialized.current) return;
	initialized.current = true;
	layout.createInitialSession(80, 24);
}, [gateway.status, layout, layout.createInitialSession, layout.reattachAll]);
```

This needs `paneMap` exposed from the hook, OR we add a `hasExistingSessions` getter. Simpler: expose `sessionCount` from the hook:

In `use-wormhole-layout.ts`:
```typescript
const sessionCount = useCallback(() => paneMap.current.size, []);
```

Then in `WormholeLayout.tsx`:
```typescript
if (layout.sessionCount() > 0) {
	layout.reattachAll(80, 24);
	return;
}
```

**Step 4: Run typecheck**

Run: `pnpm turbo run typecheck --filter=kamp-us 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/kamp-us/src/wormhole/use-wormhole-layout.ts apps/kamp-us/src/wormhole/WormholeLayout.tsx
git commit -m "feat(kamp-us): reattach sessions on WS reconnect"
```

---

### Task 8: Verify end-to-end

**Step 1: Run full typecheck**

Run: `pnpm turbo run typecheck`
Expected: PASS

**Step 2: Run all tests**

Run: `pnpm turbo run test`
Expected: PASS

**Step 3: Manual test**

1. Start dev: `pnpm turbo run dev`
2. Open terminal in browser
3. Type some commands, see output
4. Type `exit` — observe terminal stays (pane doesn't disappear)
5. Terminal should show "--- shell restarted ---" and fresh shell prompt
6. Type commands in new shell — verify I/O works
7. Disconnect WS (kill worker) and reconnect — verify sessions reattach with scrollback
