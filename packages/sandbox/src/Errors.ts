// packages/sandbox/src/Errors.ts
import {Schema} from "effect";

// ── Old errors (Schema TaggedError) ─────────────────────────
// Used by Sandbox.ts and SandboxLive.ts

export class TerminalError extends Schema.TaggedError<TerminalError>()(
	"TerminalError",
	{cause: Schema.Defect},
) {}

export class SandboxError extends Schema.TaggedError<SandboxError>()(
	"SandboxError",
	{cause: Schema.Defect},
) {}

export class ExecError extends Schema.TaggedError<ExecError>()(
	"ExecError",
	{command: Schema.String, cause: Schema.Defect},
) {}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
	"FileSystemError",
	{path: Schema.String, operation: Schema.String, cause: Schema.Defect},
) {}

// ── New errors (plain TS) ───────────────────────────────────
// Used by Wormhole channel/session management

export class ChannelExhaustedError extends Error {
  readonly _tag = "ChannelExhaustedError";
  constructor() {
    super("All channels are in use (max 254)");
  }
}

export class SandboxSleepError extends Error {
  readonly _tag = "SandboxSleepError";
  constructor(readonly sessionId: string) {
    super(`Sandbox for session ${sessionId} has gone to sleep`);
  }
}

export class SessionNotFoundError extends Error {
  readonly _tag = "SessionNotFoundError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}

export class TabNotFoundError extends Error {
  readonly _tag = "TabNotFoundError";
  constructor(readonly tabId: string) {
    super(`Tab ${tabId} not found`);
  }
}
