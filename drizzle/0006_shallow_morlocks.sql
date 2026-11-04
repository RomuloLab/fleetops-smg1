CREATE TABLE `calendarization_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `modal_catalog` ADD `is_fixed_fleet` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `modal_catalog` ADD `calendarization_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `modal_catalog` ADD `source_modal_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `modal_catalog` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `modal_catalog` ADD `change_id` text;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `is_fixed_fleet` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `license_plate` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendarization_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `source_modal_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_status` text DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_checked_at` text;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_source_at` text;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_planned` integer;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_requested` integer;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_revision` integer DEFAULT 0 NOT NULL;