import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {ApiKey, Email, PasaportError, Password, Session, User, UserId} from "./schema";

// -------------------------------------------------------------------------------------
// Payload Schemas
// -------------------------------------------------------------------------------------

export const CreateAdminApiKeyPayload = Schema.Struct({
	userId: UserId,
	name: Schema.String,
	expiresInDays: Schema.optional(Schema.Int.pipe(Schema.positive())),
});
export type CreateAdminApiKeyPayload = typeof CreateAdminApiKeyPayload.Type;

export const CreateUserPayload = Schema.Struct({
	email: Email,
	password: Password.pipe(Schema.Redacted),
	name: Schema.optional(Schema.String),
});
export type CreateUserPayload = typeof CreateUserPayload.Type;

export const LoginWithEmailPayload = Schema.Struct({
	email: Email,
	password: Password.pipe(Schema.Redacted),
});
export type LoginWithEmailPayload = typeof LoginWithEmailPayload.Type;

export const ValidateSessionPayload = Schema.Struct({
	headers: Schema.instanceOf(Headers),
});
export type ValidateSessionPayload = typeof ValidateSessionPayload.Type;

// -------------------------------------------------------------------------------------
// Success Schemas
// -------------------------------------------------------------------------------------

export const LoginWithEmailSuccess = Schema.Struct({
	user: User,
	token: Schema.Redacted(Schema.String),
});
export type LoginWithEmailSuccess = typeof LoginWithEmailSuccess.Type;

export const ValidateSessionSuccess = Schema.OptionFromNullOr(
	Schema.Struct({
		session: Session,
		user: User,
	}),
);
export type ValidateSessionSuccess = typeof ValidateSessionSuccess.Type;

// -------------------------------------------------------------------------------------
// RPC Group
// -------------------------------------------------------------------------------------

export const PasaportRpcs = RpcGroup.make(
	Rpc.make("createAdminApiKey", {
		payload: CreateAdminApiKeyPayload,
		success: ApiKey,
		error: PasaportError,
	}),
	Rpc.make("createUser", {
		payload: CreateUserPayload,
		success: User,
		error: PasaportError,
	}),
	Rpc.make("loginWithEmail", {
		payload: LoginWithEmailPayload,
		success: LoginWithEmailSuccess,
		error: PasaportError,
	}),
	Rpc.make("validateSession", {
		payload: ValidateSessionPayload,
		success: ValidateSessionSuccess,
		error: PasaportError,
	}),
);

export type PasaportRpcs = typeof PasaportRpcs;
