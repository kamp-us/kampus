import {Context} from "effect";

/**
 * Provides access to Cloudflare environment bindings.
 */
export class CloudflareEnv extends Context.Tag("@kampus/worker/CloudflareEnv")<
	CloudflareEnv,
	Env
>() {}
