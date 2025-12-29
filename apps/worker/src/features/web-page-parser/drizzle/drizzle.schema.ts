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
