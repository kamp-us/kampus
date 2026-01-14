import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import * as Errors from "./errors.js";
import {ApiKey, Session, SignInResponse, User} from "./pasaport-schema.js";

export const PasaportRpcs = RpcGroup.make(
	// Sign in with email and password
	Rpc.make("signIn", {
		payload: {
			email: Schema.String,
			password: Schema.String,
		},
		success: SignInResponse,
		error: Errors.InvalidCredentialsError,
	}),

	// Create a new user account
	Rpc.make("signUp", {
		payload: {
			email: Schema.String,
			password: Schema.String,
			name: Schema.optional(Schema.String),
		},
		success: User,
		error: Schema.Union(Errors.UserAlreadyExistsError, Errors.UserCreationFailedError),
	}),

	// Validate current session (returns null if not authenticated)
	Rpc.make("validateSession", {
		payload: Schema.Void,
		success: Schema.NullOr(Session),
	}),

	// Get current user (returns null if not authenticated)
	Rpc.make("me", {
		payload: Schema.Void,
		success: Schema.NullOr(User),
	}),

	// Create an API key (requires authentication - enforced by caller)
	Rpc.make("createApiKey", {
		payload: {
			name: Schema.String,
			expiresInDays: Schema.optional(Schema.Int.pipe(Schema.positive())),
		},
		success: ApiKey,
		error: Errors.ApiKeyCreationFailedError,
	}),
);

export type PasaportRpcs = typeof PasaportRpcs;
