-- Rename 'string' column to 'url' and add 'normalized_url' column
ALTER TABLE `story` RENAME COLUMN `string` TO `url`;
--> statement-breakpoint
ALTER TABLE `story` ADD `normalized_url` text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Update normalized_url from url for existing rows
UPDATE `story` SET `normalized_url` = `url` WHERE `normalized_url` = '';
--> statement-breakpoint
-- Recreate index with correct column name
DROP INDEX IF EXISTS `idx_story_normalized_url`;
--> statement-breakpoint
CREATE INDEX `idx_story_normalized_url` ON `story` (`normalized_url`);
--> statement-breakpoint
CREATE INDEX `idx_story_url` ON `story` (`url`);
