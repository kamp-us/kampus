import {Context} from "effect";

/**
 * Provides access to Durable Object environment bindings.
 * Used by handlers to access DO bindings and other env values.
 */
export class DurableObjectEnv extends Context.Tag("DO/Env")<DurableObjectEnv, Env>() {}

/**
 * Provides access to Durable Object state context.
 * Used by handlers that need direct storage access.
 *
 * NOTE: This is intentionally defined here (not re-exported from @kampus/spellbook)
 * due to type incompatibility between wrangler-generated types and @cloudflare/workers-types.
 * See CONV-001 in specs/kampus-spellbook/prd.json for migration path.
 *
 * Convention:
 * - DurableObjectCtx: worker-specific, uses wrangler-generated DurableObjectState
 * - @kampus/spellbook/DurableObjectCtx: package-generic, uses @cloudflare/workers-types
 * - Tests can use spellbook's DurableObjectCtx with mocks since type is approximate
 */
export class DurableObjectCtx extends Context.Tag("DO/Ctx")<
	DurableObjectCtx,
	DurableObjectState
>() {}
