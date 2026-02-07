import {Effect, Layer, Option, Redacted} from "effect";
import {
	ApiKey,
	Email,
	PasaportError,
	type Password,
	Session,
	SessionId,
	User,
	UserId,
} from "../schema";
import {BetterAuth} from "./BetterAuth";
import {Pasaport} from "./Pasaport";

export const layer = Layer.effect(
	Pasaport,
	Effect.gen(function* () {
		const better = yield* BetterAuth;

		const createAdminApiKey = Effect.fn("BetterAuthPasaport.createAdminApiKey")(
			(userId: UserId, name: string, expiresInDays = 7) =>
				better
					.use((auth) =>
						auth.api.createApiKey({
							body: {name, expiresIn: 60 * 60 * 24 * expiresInDays, userId},
						}),
					)
					.pipe(
						Effect.map((key) => ApiKey.make({name: key.name, value: key.key})),
						Effect.catchTag(
							"BetterAuthError",
							(cause) => new PasaportError({method: "createAdminApiKey", cause}),
						),
					),
		);

		const createUser = Effect.fn("BetterAuthPasaport.createUser")(
			(email: Email, password: Redacted.Redacted<Password>, name?: string) =>
				better
					.use((auth) =>
						auth.api.signUpEmail({
							body: {
								email,
								password: Redacted.value(password),
								name: name || "User",
								image: `https://robohash.org/${email}`,
							},
						}),
					)
					.pipe(
						Effect.map(({user}) =>
							User.make({
								id: UserId.make(user.id),
								name: user.name,
								email: Email.make(user.email),
								avatar: user.image ? new URL(user.image) : null,
							}),
						),
						Effect.catchTag(
							"BetterAuthError",
							(cause) => new PasaportError({method: "createUser", cause}),
						),
					),
		);

		const loginWithEmail = Effect.fn("BetterAuthPasaport.loginWithEmail")(
			(email: Email, password: Redacted.Redacted<Password>) =>
				better
					.use((auth) =>
						auth.api.signInEmail({
							body: {email, password: Redacted.value(password), rememberMe: false},
							returnHeaders: true,
						}),
					)
					.pipe(
						Effect.flatMap(({response, headers: responseHeaders}) => {
							const bearerToken = responseHeaders?.get("set-auth-token");
							if (!bearerToken) {
								return new PasaportError({
									method: "loginWithEmail",
									cause: new Error("No bearer token returned"),
								});
							}
							return Effect.succeed({
								user: User.make({
									id: UserId.make(response.user.id),
									name: response.user.name,
									email: Email.make(response.user.email),
									avatar: response.user.image ? new URL(response.user.image) : null,
								}),
								token: Redacted.make(bearerToken),
							});
						}),
						Effect.catchTag(
							"BetterAuthError",
							(cause) => new PasaportError({method: "loginWithEmail", cause}),
						),
					),
		);

		const validateSession = Effect.fn("BetterAuthPasaport.validateSession")((headers: Headers) =>
			better
				.use((auth) => auth.api.getSession({headers}))
				.pipe(
					Effect.map((result) => {
						if (!result?.session || !result?.user) {
							return Option.none();
						}
						return Option.some({
							session: Session.make({
								id: SessionId.make(result.session.id),
								userId: UserId.make(result.session.userId),
								createdAt: new Date(result.session.createdAt),
							}),
							user: User.make({
								id: UserId.make(result.user.id),
								name: result.user.name,
								email: Email.make(result.user.email),
								avatar: result.user.image ? new URL(result.user.image) : null,
							}),
						});
					}),
					Effect.catchTag(
						"BetterAuthError",
						(cause) => new PasaportError({method: "validateSession", cause}),
					),
				),
		);

		return Pasaport.of({
			createAdminApiKey,
			createUser,
			loginWithEmail,
			validateSession,
		});
	}),
);
