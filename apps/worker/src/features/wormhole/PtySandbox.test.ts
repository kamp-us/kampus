import {it} from "@effect/vitest";
import type {Sandbox} from "@cloudflare/sandbox";
import {Chunk, Effect, Fiber, Layer, type Scope, Stream} from "effect";
import {beforeEach, describe, expect} from "vitest";
import {Pty} from "@kampus/wormhole/Pty";
import {PtySandbox} from "./PtySandbox";
import {SandboxBinding} from "./SandboxBinding";

// ── Mock infrastructure ──────────────────────────────────────
let mockServerWs: WebSocket;
let mockClientMessages: string[];

const MockSandboxBinding = Layer.succeed(
	SandboxBinding,
	{
		idFromName: () => ({toString: () => "mock-sandbox"}) as unknown as DurableObjectId,
		get: () =>
			({
				fetch: async (_request: Request): Promise<Response> => {
					const pair = new WebSocketPair();
					const [client, server] = Object.values(pair);
					server.accept();

					server.addEventListener("message", (evt: MessageEvent) => {
						mockClientMessages.push(
							typeof evt.data === "string"
								? evt.data
								: new TextDecoder().decode(evt.data as ArrayBuffer),
						);
					});

					mockServerWs = server;
					return new Response(null, {status: 101, webSocket: client});
				},
			}) as unknown as DurableObjectStub,
	} as unknown as DurableObjectNamespace<Sandbox>,
);

const TestLayer = PtySandbox.pipe(Layer.provide(MockSandboxBinding));

// Effect.sleep doesn't work in workers vitest pool — use setTimeout
const delay = (ms: number) =>
	Effect.promise<void>(() => new Promise((r) => setTimeout(r, ms)));

// Helper: wrap with explicit Effect.scoped since it.scoped hangs in workers pool
const scoped = <A, E>(
	effect: Effect.Effect<A, E, Pty | Scope.Scope>,
): Effect.Effect<A, E, never> => Effect.scoped(effect).pipe(Effect.provide(TestLayer));

// ── Tests ────────────────────────────────────────────────────

describe("PtySandbox", () => {
	beforeEach(() => {
		mockClientMessages = [];
	});

	it.effect("spawn returns PtyProcess with expected shape", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});
				expect(proc.output).toBeDefined();
				expect(proc.write).toBeTypeOf("function");
				expect(proc.resize).toBeTypeOf("function");
				expect(proc.awaitExit).toBeDefined();
			}),
		),
	);

	it.effect("write sends data to WebSocket", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});

				yield* proc.write("ls\n");
				yield* delay(10);

				expect(mockClientMessages).toContain("ls\n");
			}),
		),
	);

	it.effect("resize sends JSON control message", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});

				yield* proc.resize(120, 40);
				yield* delay(10);

				const resizeMsg = mockClientMessages.find((m) => {
					try {
						return JSON.parse(m).type === "resize";
					} catch {
						return false;
					}
				});

				expect(resizeMsg).toBeDefined();
				expect(JSON.parse(resizeMsg!)).toEqual({type: "resize", cols: 120, rows: 40});
			}),
		),
	);

	it.effect("output stream emits terminal data from binary frames", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});

				const fiber = yield* proc.output
					.pipe(Stream.take(1), Stream.runCollect)
					.pipe(Effect.fork);
				yield* delay(50);

				mockServerWs.send(new TextEncoder().encode("hello world"));
				yield* delay(50);

				const result = yield* Fiber.join(fiber);
				expect(Chunk.toReadonlyArray(result)).toEqual(["hello world"]);
			}),
		),
	);

	it.effect("awaitExit resolves on exit control message", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});

				const fiber = yield* proc.awaitExit.pipe(Effect.fork);
				yield* delay(50);

				mockServerWs.send(JSON.stringify({type: "exit", code: 42}));
				yield* delay(50);

				const exitCode = yield* Fiber.join(fiber);
				expect(exitCode).toBe(42);
			}),
		),
	);

	it.effect("write is no-op after process exits", () =>
		scoped(
			Effect.gen(function* () {
				const pty = yield* Pty;
				const proc = yield* pty.spawn({cols: 80, rows: 24});

				mockServerWs.send(JSON.stringify({type: "exit", code: 0}));
				yield* delay(50);

				yield* proc.write("should not send");
				yield* delay(10);

				expect(mockClientMessages).not.toContain("should not send");
			}),
		),
	);
});
