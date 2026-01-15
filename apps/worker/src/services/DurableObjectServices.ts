import {Context} from "effect";

/**
 * Provides access to Durable Object environment bindings.
 * Used by handlers to access DO bindings and other env values.
 */
export class DurableObjectEnv extends Context.Tag("DO/Env")<DurableObjectEnv, Env>() {}

/**
 * Provides access to Durable Object state context.
 * Used by handlers that need direct storage access.
 */
export class DurableObjectCtx extends Context.Tag("DO/Ctx")<
	DurableObjectCtx,
	DurableObjectState
>() {}
