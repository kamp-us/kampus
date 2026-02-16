/**
 * @module
 *
 * Pure interface definitions for the Sandbox service. `Sandbox` is an
 * Effect {@link Context.Tag} — consumers depend on the tag, and the
 * concrete implementation (e.g. Cloudflare Sandbox SDK) is provided at the edge.
 */
import {Context, type Effect, type Stream} from "effect";

// ── Options ────────────────────────────────────────────────

/** Options for creating a new sandbox session. */
export interface SessionOptions {
  readonly id?: string;
  readonly env?: Record<string, string>;
  readonly cwd?: string;
}

/** Initial dimensions for a terminal. */
export interface TerminalOptions {
  readonly cols: number;
  readonly rows: number;
}

/** Options for one-shot command execution (`exec` / `execStream`). */
export interface ExecOptions {
  readonly env?: Record<string, string>;
  readonly cwd?: string;
  readonly timeout?: number;
  readonly stdin?: string;
}

/** Options for long-running background processes (`startProcess`). */
export interface ProcessOptions {
  readonly processId?: string;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

// ── Result types ───────────────────────────────────────────

/** Result of a completed one-shot command execution. */
export interface ExecResult {
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Streaming event emitted during `execStream`. Events arrive in order: `start`, then interleaved `stdout`/`stderr`, then `complete` or `error`. */
export interface ExecEvent {
  readonly type: "start" | "stdout" | "stderr" | "complete" | "error";
  readonly data?: string;
  readonly exitCode?: number;
}

/** Handle to a long-running background process started via `startProcess`. */
export interface ProcessHandle {
  readonly id: string;
  readonly kill: () => Effect.Effect<void>;
  readonly getLogs: () => Effect.Effect<string>;
  readonly waitForExit: () => Effect.Effect<number>;
}

/** Snapshot of a background process's current state. */
export interface ProcessInfo {
  readonly id: string;
  readonly command: string;
  readonly running: boolean;
}

// ── Terminal ─────────────────────────────────────────────

/** An interactive terminal (PTY). `output` is a stream of raw terminal data; `write` sends keystrokes/data in. */
export interface Terminal {
  readonly output: Stream.Stream<string>;
  readonly awaitExit: Effect.Effect<number>;
  readonly write: (data: string) => Effect.Effect<void>;
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
}

// ── Session (one isolated execution context) ───────────────

/**
 * One isolated execution context within a sandbox.
 *
 * - `terminal` — spawn an interactive PTY (for UI terminals)
 * - `exec` — run a command and collect stdout/stderr (one-shot, buffered)
 * - `execStream` — run a command and stream events as they arrive
 * - `startProcess` — launch a long-running background process with a handle to kill/wait
 */
export interface Session {
  readonly id: string;
  readonly terminal: (
    options: TerminalOptions,
  ) => Effect.Effect<Terminal, import("./Errors.ts").TerminalError>;
  readonly exec: (
    command: string,
    options?: ExecOptions,
  ) => Effect.Effect<ExecResult, import("./Errors.ts").ExecError>;
  readonly execStream: (
    command: string,
    options?: ExecOptions,
  ) => Effect.Effect<Stream.Stream<ExecEvent>, import("./Errors.ts").ExecError>;
  readonly startProcess: (
    command: string,
    options?: ProcessOptions,
  ) => Effect.Effect<ProcessHandle, import("./Errors.ts").ExecError>;
  readonly readFile: (
    path: string,
  ) => Effect.Effect<string, import("./Errors.ts").FileSystemError>;
  readonly writeFile: (
    path: string,
    content: string,
  ) => Effect.Effect<void, import("./Errors.ts").FileSystemError>;
  readonly mkdir: (
    path: string,
  ) => Effect.Effect<void, import("./Errors.ts").FileSystemError>;
  readonly deleteFile: (
    path: string,
  ) => Effect.Effect<void, import("./Errors.ts").FileSystemError>;
  readonly setEnvVars: (
    vars: Record<string, string | undefined>,
  ) => Effect.Effect<void>;
}

// ── Sandbox (the platform primitive) ───────────────────────

/**
 * Effect context tag for the sandbox service.
 *
 * Provides session lifecycle management: create, get, delete, and destroy.
 * The concrete implementation is swapped at the composition root (e.g. Cloudflare Sandbox SDK).
 */
export class Sandbox extends Context.Tag("@kampus/sandbox/Sandbox")<
  Sandbox,
  {
    readonly createSession: (
      options?: SessionOptions,
    ) => Effect.Effect<Session, import("./Errors.ts").SandboxError>;
    readonly getSession: (
      id: string,
    ) => Effect.Effect<Session, import("./Errors.ts").SandboxError>;
    readonly deleteSession: (
      id: string,
    ) => Effect.Effect<void, import("./Errors.ts").SandboxError>;
    readonly destroy: () => Effect.Effect<void>;
    readonly setKeepAlive: (keepAlive: boolean) => Effect.Effect<void>;
  }
>() {}
