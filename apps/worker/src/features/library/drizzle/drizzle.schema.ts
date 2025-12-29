import {id} from "@usirin/forge";
import {index, integer, primaryKey, sqliteTable, text} from "drizzle-orm/sqlite-core";

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
);

export const tag = sqliteTable(
	"tag",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id("tag")),

		name: text("name").notNull(),
		color: text("color").notNull(),

		createdAt: timestamp("created_at")
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [index("idx_tag_name").on(table.name)],
);

export const storyTag = sqliteTable(
	"story_tag",
	{
		storyId: text("story_id").notNull(),
		tagId: text("tag_id").notNull(),
	},
	(table) => [
		primaryKey({columns: [table.storyId, table.tagId]}),
		index("idx_story_tag_story_id").on(table.storyId),
		index("idx_story_tag_tag_id").on(table.tagId),
	],
);
