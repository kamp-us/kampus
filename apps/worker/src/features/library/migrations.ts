import {SqlClient} from "@effect/sql";
import {SqliteMigrator} from "@effect/sql-sqlite-do";
import {Effect} from "effect";

const make = (statements: TemplateStringsArray) =>
	Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;
		// Split by statement-breakpoint and execute each
		const parts = statements[0].split("--> statement-breakpoint");
		for (const part of parts) {
			const trimmed = part.trim();
			if (trimmed) {
				yield* sql.unsafe(trimmed);
			}
		}
	});

export const migrations = SqliteMigrator.fromRecord({
	"0001_initial_schema": make`
CREATE TABLE story (
	id text PRIMARY KEY NOT NULL,
	url text NOT NULL,
	normalized_url text NOT NULL DEFAULT '',
	title text NOT NULL,
	description text,
	created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_story_normalized_url ON story (normalized_url);
--> statement-breakpoint
CREATE INDEX idx_story_created_at ON story (created_at);
--> statement-breakpoint
CREATE TABLE tag (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	color text NOT NULL,
	created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_tag_name ON tag (name);
--> statement-breakpoint
CREATE TABLE story_tag (
	story_id text NOT NULL,
	tag_id text NOT NULL,
	PRIMARY KEY(story_id, tag_id),
	FOREIGN KEY (story_id) REFERENCES story(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (tag_id) REFERENCES tag(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX idx_story_tag_story_id ON story_tag (story_id);
--> statement-breakpoint
CREATE INDEX idx_story_tag_tag_id ON story_tag (tag_id);
`,
});
