CREATE TABLE `reader_content` (
	`id` text PRIMARY KEY NOT NULL,
	`readable` integer DEFAULT 0 NOT NULL,
	`title` text,
	`content` text,
	`text_content` text,
	`excerpt` text,
	`byline` text,
	`site_name` text,
	`word_count` integer,
	`reading_time_minutes` integer,
	`error` text,
	`created_at` integer
);
