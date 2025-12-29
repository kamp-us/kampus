CREATE TABLE `story` (
	`id` text PRIMARY KEY NOT NULL,
	`string` text,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_story_normalized_url` ON `story` (`string`);--> statement-breakpoint
CREATE INDEX `idx_story_created_at` ON `story` (`created_at`);