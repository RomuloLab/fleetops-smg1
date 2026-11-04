CREATE TABLE `stela_voice_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`voice_id` text DEFAULT '' NOT NULL,
	`voice_name` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`monthly_limit` integer DEFAULT 5000 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`change_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stela_voice_usage` (
	`period` text PRIMARY KEY NOT NULL,
	`characters` integer DEFAULT 0 NOT NULL
);
