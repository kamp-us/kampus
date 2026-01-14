import {Schema} from "effect";

// User schema
export const User = Schema.Struct({
	id: Schema.String,
	email: Schema.String,
	name: Schema.NullOr(Schema.String),
	image: Schema.NullOr(Schema.String),
});
export type User = typeof User.Type;

// Session schema
export const Session = Schema.Struct({
	user: User,
	session: Schema.Struct({
		id: Schema.String,
		userId: Schema.String,
		expiresAt: Schema.String,
	}),
});
export type Session = typeof Session.Type;

// ApiKey schema
export const ApiKey = Schema.Struct({
	name: Schema.NullOr(Schema.String),
	key: Schema.String,
});
export type ApiKey = typeof ApiKey.Type;

// Sign in response
export const SignInResponse = Schema.Struct({
	user: User,
	token: Schema.String,
});
export type SignInResponse = typeof SignInResponse.Type;
