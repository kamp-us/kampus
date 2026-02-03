import {Effect} from "effect";
import {
	type CreateAdminApiKeyPayload,
	type CreateUserPayload,
	type LoginWithEmailPayload,
	PasaportRpcs,
	type ValidateSessionPayload,
} from "./rpc";
import {Pasaport} from "./services/Pasaport";

export const PasaportLive = PasaportRpcs.toLayer(
	Effect.gen(function* () {
		const pasaport = yield* Pasaport;

		return {
			createAdminApiKey: (payload: CreateAdminApiKeyPayload) =>
				pasaport.createAdminApiKey(payload.userId, payload.name, payload.expiresInDays),
			createUser: (payload: CreateUserPayload) =>
				pasaport.createUser(payload.email, payload.password, payload.name),
			loginWithEmail: (payload: LoginWithEmailPayload) =>
				pasaport.loginWithEmail(payload.email, payload.password),
			validateSession: (payload: ValidateSessionPayload) =>
				pasaport.validateSession(payload.headers),
		};
	}),
);
