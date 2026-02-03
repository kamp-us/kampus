import {Context, Data, Effect} from "effect";
import type {Session} from "../features/pasaport/auth";

/**
 * Authentication error - thrown when auth is required but not present.
 */
export class Unauthorized extends Data.TaggedError("Unauthorized")<{
	readonly message: string;
}> {}

/**
 * Provides authentication context for the current request.
 */
export class Auth extends Context.Tag("@kampus/worker/Auth")<
	Auth,
	{
		readonly user: Session["user"] | undefined;
		readonly session: Session["session"] | undefined;
	}
>() {
	/**
	 * Require authenticated user - fails with Unauthorized if not present.
	 */
	static readonly required = Effect.gen(function* () {
		const auth = yield* Auth;
		if (!auth.user) {
			return yield* new Unauthorized({message: "Authentication required"});
		}
		return {user: auth.user, session: auth.session};
	});
}
