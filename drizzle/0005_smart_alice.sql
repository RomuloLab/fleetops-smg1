CREATE TABLE `carrier_modal_settings` (
	`carrier` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`change_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `modal_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modal_catalog_code` ON `modal_catalog` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `modal_catalog_name_key` ON `modal_catalog` (`name_key`);