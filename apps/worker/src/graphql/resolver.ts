import {Effect, type ManagedRuntime} from "effect";

/**
 * GraphQL context that includes the Effect runtime.
 */
export interface EffectContext<R> {
	readonly runtime: ManagedRuntime.ManagedRuntime<R, never>;
}

/**
 * Wraps an Effect generator function as a GraphQL resolver.
 *
 * Enables request batching so that multiple Effect.request calls in the same
 * tick are automatically batched via RequestResolvers (e.g., StoryResolver, TagResolver).
 */
export function resolver<TSource, TArgs, A>(
	body: (source: TSource, args: TArgs) => Generator<any, A, any>,
): (source: TSource, args: TArgs, context: EffectContext<any>) => Promise<A> {
	return (source, args, context) => {
		const effect = Effect.gen(() => body(source, args)).pipe(Effect.withRequestBatching(true));
		return context.runtime.runPromise(effect);
	};
}
