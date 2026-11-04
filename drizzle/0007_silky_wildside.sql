CREATE TABLE `manager_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`identity_id` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`change_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manager_users_email` ON `manager_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `manager_users_identity_id` ON `manager_users` (`identity_id`);