import {id} from "@usirin/forge";
import {integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

// Consistent timestamp handling using text + SQL default
const timestamps = {
	createdAt: timestamp("created_at").$defaultFn(() => new Date()),
	updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
};

export const user = sqliteTable("user", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("user")),

	name: text("name"),
	email: text("email").notNull(),
	image: text("image"),
	type: text("type", {enum: ["human", "bot"]})
		.notNull()
		.default("human"),
	emailVerified: integer("email_verified", {mode: "boolean"}),
	...timestamps,
});

export const session = sqliteTable("session", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("sesh")),
	userID: text("user_id")
		.notNull()
		.references(() => user.id, {onDelete: "cascade"}), // Cascade delete sessions on user delete
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").unique(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	...timestamps,
});

export const account = sqliteTable("account", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("acc")),
	userID: text("user_id")
		.notNull()
		.references(() => user.id, {onDelete: "cascade"}), // Cascade delete accounts on user delete
	providerAccountID: text("provider_account_id").notNull(),
	provider: text("provider").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	scope: text("scope"),
	password: text("password"), // For email/password credential type
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	...timestamps,
});

export const verification = sqliteTable("verification", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("vxn")), // Added default ID generation
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	...timestamps,
});

export const apikey = sqliteTable("apiKey", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("api_key")),
	name: text("name"),
	start: text("start"), // First few chars for UI display
	prefix: text("prefix"),
	key: text("key").notNull(), // Hashed API key
	userId: text("user_id")
		.notNull()
		.references(() => user.id, {onDelete: "cascade"}),
	refillInterval: integer("refill_interval"), // in milliseconds
	refillAmount: integer("refill_amount"),
	lastRefillAt: integer("last_refill_at", {mode: "timestamp"}),
	enabled: integer("enabled", {mode: "boolean"}).notNull().default(true),
	rateLimitEnabled: integer("rate_limit_enabled", {mode: "boolean"}).notNull().default(false),
	rateLimitTimeWindow: integer("rate_limit_time_window"), // in milliseconds
	rateLimitMax: integer("rate_limit_max"),
	requestCount: integer("request_count").notNull().default(0),
	remaining: integer("remaining"),
	lastRequest: integer("last_request", {mode: "timestamp"}),
	expiresAt: integer("expires_at", {mode: "timestamp"}),
	permissions: text("permissions"), // JSON string
	metadata: text("metadata"), // JSON string for customer info
	...timestamps,
});
