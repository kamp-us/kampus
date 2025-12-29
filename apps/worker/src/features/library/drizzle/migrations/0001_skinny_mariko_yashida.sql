CREATE TABLE `story_tag` (
	`story_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`story_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_story_tag_story_id` ON `story_tag` (`story_id`);--> statement-breakpoint
CREATE INDEX `idx_story_tag_tag_id` ON `story_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tag_name` ON `tag` (`name`);