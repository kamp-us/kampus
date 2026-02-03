import {Schema} from "effect";

// -------------------------------------------------------------------------------------
// Branded Types
// -------------------------------------------------------------------------------------

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const Email = Schema.String.pipe(
	Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
	Schema.brand("Email"),
);
export type Email = typeof Email.Type;

export const Password = Schema.String.pipe(Schema.minLength(8), Schema.brand("Password"));
export type Password = typeof Password.Type;

export const IPv4 = Schema.String.pipe(
	Schema.pattern(/^(\d{1,3}\.){3}\d{1,3}$/),
	Schema.brand("IPv4"),
);
export type IPv4 = typeof IPv4.Type;

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

// -------------------------------------------------------------------------------------
// Domain Models
// -------------------------------------------------------------------------------------

/** API key for programmatic access. */
export class ApiKey extends Schema.TaggedClass<ApiKey>()("ApiKey", {
	name: Schema.NullOr(Schema.String),
	value: Schema.String,
}) {}

/** Active user session. */
export class Session extends Schema.TaggedClass<Session>()("Session", {
	id: SessionId,
	userId: UserId,
	createdAt: Schema.DateFromSelf,
}) {}

/** Authenticated user. */
export class User extends Schema.TaggedClass<User>()("User", {
	id: UserId,
	email: Email,
	name: Schema.String,
	avatar: Schema.NullishOr(Schema.URL),
}) {}

// -------------------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------------------

export class PasaportError extends Schema.TaggedError<PasaportError>()("PasaportError", {
	method: Schema.String,
	cause: Schema.Defect,
}) {}
