import {Effect, type ManagedRuntime} from "effect";

/**
 * GraphQL context that includes the Effect runtime.
 */
export interface EffectContext<R> {
	readonly runtime: ManagedRuntime.ManagedRuntime<R, never>;
}

/**
 * Wraps an Effect generator function as a GraphQL resolver.
 */
export function resolver<TSource, TArgs, A>(
	// biome-ignore lint/suspicious/noExplicitAny: Effect.gen requires specific YieldWrap types
	body: (source: TSource, args: TArgs) => Generator<any, A, any>,
	// biome-ignore lint/suspicious/noExplicitAny: Runtime context type is erased at this boundary
): (source: TSource, args: TArgs, context: EffectContext<any>) => Promise<A> {
	return (source, args, context) => {
		return context.runtime.runPromise(Effect.gen(() => body(source, args)));
	};
}
