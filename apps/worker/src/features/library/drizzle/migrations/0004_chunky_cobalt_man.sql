PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_story_tag` (
	`story_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`story_id`, `tag_id`),
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_story_tag`("story_id", "tag_id") SELECT "story_id", "tag_id" FROM `story_tag`;--> statement-breakpoint
DROP TABLE `story_tag`;--> statement-breakpoint
ALTER TABLE `__new_story_tag` RENAME TO `story_tag`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_story_tag_story_id` ON `story_tag` (`story_id`);--> statement-breakpoint
CREATE INDEX `idx_story_tag_tag_id` ON `story_tag` (`tag_id`);