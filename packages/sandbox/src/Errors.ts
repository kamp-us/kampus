/**
 * @module
 *
 * Error types for the sandbox package. Two styles coexist:
 *
 * - **Schema TaggedErrors** (`TerminalError`, `SandboxError`, `ExecError`, `FileSystemError`):
 *   Effect-native errors used by the {@link Sandbox} service interface. They are
 *   schema-encoded, so they survive serialization across Worker boundaries.
 *
 * - **Plain TS errors** (`ChannelExhaustedError`, `SandboxSleepError`, etc.):
 *   Lightweight errors used by Wormhole session/channel management where
 *   schema encoding isn't needed.
 */
import {Schema} from "effect";

// ── Schema TaggedErrors (Sandbox service interface) ─────────

/** Thrown when a terminal operation (spawn, write, resize) fails. */
export class TerminalError extends Schema.TaggedError<TerminalError>()(
	"TerminalError",
	{cause: Schema.Defect},
) {}

/** Thrown when a sandbox-level operation (create/get/delete session, destroy) fails. */
export class SandboxError extends Schema.TaggedError<SandboxError>()(
	"SandboxError",
	{cause: Schema.Defect},
) {}

/** Thrown when command execution fails. `command` is the shell string that was run. */
export class ExecError extends Schema.TaggedError<ExecError>()(
	"ExecError",
	{command: Schema.String, cause: Schema.Defect},
) {}

/** Thrown when a filesystem operation fails. `operation` is the verb (e.g. "read", "write", "mkdir"). */
export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
	"FileSystemError",
	{path: Schema.String, operation: Schema.String, cause: Schema.Defect},
) {}

// ── Plain TS errors (Wormhole channel/session management) ───

/** Thrown when all 254 data channels are in use and a new PTY cannot be assigned. */
export class ChannelExhaustedError extends Error {
  readonly _tag = "ChannelExhaustedError";
  constructor() {
    super("All channels are in use (max 254)");
  }
}

/** Thrown when a sandbox has been evicted or hibernated and is no longer reachable. */
export class SandboxSleepError extends Error {
  readonly _tag = "SandboxSleepError";
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Sandbox for session ${sessionId} has gone to sleep`);
    this.sessionId = sessionId;
  }
}

/** Thrown when referencing a session ID that doesn't exist in the Wormhole state. */
export class SessionNotFoundError extends Error {
  readonly _tag = "SessionNotFoundError";
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.sessionId = sessionId;
  }
}

/** Thrown when referencing a tab ID that doesn't exist in the Wormhole state. */
export class TabNotFoundError extends Error {
  readonly _tag = "TabNotFoundError";
  readonly tabId: string;
  constructor(tabId: string) {
    super(`Tab ${tabId} not found`);
    this.tabId = tabId;
  }
}
