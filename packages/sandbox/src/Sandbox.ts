import {Context, type Effect, type Stream} from "effect";

// ── Options ────────────────────────────────────────────────

export interface SessionOptions {
  readonly id?: string;
  readonly env?: Record<string, string>;
  readonly cwd?: string;
}

export interface TerminalOptions {
  readonly cols: number;
  readonly rows: number;
}

export interface ExecOptions {
  readonly env?: Record<string, string>;
  readonly cwd?: string;
  readonly timeout?: number;
  readonly stdin?: string;
}

export interface ProcessOptions {
  readonly processId?: string;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

// ── Result types ───────────────────────────────────────────

export interface ExecResult {
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface ExecEvent {
  readonly type: "start" | "stdout" | "stderr" | "complete" | "error";
  readonly data?: string;
  readonly exitCode?: number;
}

export interface ProcessHandle {
  readonly id: string;
  readonly kill: () => Effect.Effect<void>;
  readonly getLogs: () => Effect.Effect<string>;
  readonly waitForExit: () => Effect.Effect<number>;
}

export interface ProcessInfo {
  readonly id: string;
  readonly command: string;
  readonly running: boolean;
}

// ── Terminal (replaces PtyProcess) ─────────────────────────

export interface Terminal {
  readonly output: Stream.Stream<string>;
  readonly awaitExit: Effect.Effect<number>;
  readonly write: (data: string) => Effect.Effect<void>;
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
}

// ── Session (one isolated execution context) ───────────────

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
