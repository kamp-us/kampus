import {id} from "@usirin/forge";
import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

export const story = sqliteTable(
	"story",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id("story")),

		url: text("string"),
		normalizedUrl: text("string"),

		title: text("title").notNull(),
		description: text("description"),

		createdAt: timestamp("created_at")
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		index("idx_story_normalized_url").on(table.normalizedUrl),
		index("idx_story_created_at").on(table.createdAt),
	],
	// Indexes for common queries
);
