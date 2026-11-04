CREATE TABLE `registered_carriers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`initials` text NOT NULL,
	`logo_key` text,
	`logo_mime` text,
	`logo_hash` text DEFAULT '' NOT NULL,
	`logo_width` integer DEFAULT 0 NOT NULL,
	`logo_height` integer DEFAULT 0 NOT NULL,
	`logo_view_box` text DEFAULT '' NOT NULL,
	`logo_background` text DEFAULT '#ffffff' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registered_carriers_slug` ON `registered_carriers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `registered_carriers_name_key` ON `registered_carriers` (`name_key`);