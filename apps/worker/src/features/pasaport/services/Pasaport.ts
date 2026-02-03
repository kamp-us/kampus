import {Context, type Effect, type Option, type Redacted} from "effect";
import type {ApiKey, Email, PasaportError, Password, Session, User, UserId} from "../schema";
import {layer} from "./BetterAuthPasaport";

/**
 * Authentication service for user management and session handling.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const pasaport = yield* Pasaport;
 *   const user = yield* pasaport.createUser(Email.make("test@example.com"), "password123");
 * });
 * ```
 */
export class Pasaport extends Context.Tag("worker/features/pasaport/services/Pasaport")<
	Pasaport,
	{
		/**
		 * Creates an API key for admin access.
		 * @param userId - User to create the key for
		 * @param name - Human-readable key name
		 * @param expiresInDays - Key expiration (default: 7 days)
		 */
		createAdminApiKey: (
			userId: UserId,
			name: string,
			expiresInDays?: number,
		) => Effect.Effect<ApiKey, PasaportError>;

		/**
		 * Registers a new user with email/password.
		 * @param email - User's email address
		 * @param password - Plain text password (min 8 chars)
		 * @param name - Display name (default: "User")
		 */
		createUser: (
			email: Email,
			password: Redacted.Redacted<Password>,
			name?: string,
		) => Effect.Effect<User, PasaportError>;

		/**
		 * Authenticates user with email/password credentials.
		 * @param email - User's email address
		 * @param password - Redacted password
		 * @returns User and bearer token for subsequent requests
		 */
		loginWithEmail: (
			email: Email,
			password: Redacted.Redacted<Password>,
		) => Effect.Effect<{user: User; token: Redacted.Redacted<string>}, PasaportError>;

		/**
		 * Validates a session from request headers.
		 * @param headers - Request headers containing session cookie/token
		 * @returns Option.some with session+user if valid, Option.none if invalid/expired
		 */
		validateSession: (
			headers: Headers,
		) => Effect.Effect<Option.Option<{session: Session; user: User}>, PasaportError>;
	}
>() {
	static layerBetterAuth = layer;
}
