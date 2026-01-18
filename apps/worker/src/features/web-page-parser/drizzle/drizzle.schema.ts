import {id} from "@usirin/forge";
import {integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

export const fetchlog = sqliteTable("fetchlog", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("wbp_flog")),

	title: text("title").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});

export const readerContent = sqliteTable("reader_content", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id("wbp_read")),

	readable: integer("readable").notNull().default(0),
	title: text("title"),
	content: text("content"),
	textContent: text("text_content"),
	excerpt: text("excerpt"),
	byline: text("byline"),
	siteName: text("site_name"),
	wordCount: integer("word_count"),
	readingTimeMinutes: integer("reading_time_minutes"),
	error: text("error"),
	createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});
