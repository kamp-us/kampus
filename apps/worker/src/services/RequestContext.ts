import {Context} from "effect";

/**
 * Provides request-scoped context including headers and metadata.
 */
export class RequestContext extends Context.Tag("@kampus/worker/RequestContext")<
	RequestContext,
	{
		readonly headers: Headers;
		readonly url: string;
		readonly method: string;
	}
>() {}
