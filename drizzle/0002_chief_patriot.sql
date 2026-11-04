CREATE TABLE `scheduling_status_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`change_id` text NOT NULL,
	`request_id` text NOT NULL,
	`carrier` text NOT NULL,
	`date` text NOT NULL,
	`cycle` text NOT NULL,
	`modal_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	`resolution_notes` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `scheduling_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduling_status_change_id` ON `scheduling_status_events` (`change_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scheduling_status_request_revision` ON `scheduling_status_events` (`request_id`,`revision`);--> statement-breakpoint
CREATE INDEX `scheduling_status_carrier_seq` ON `scheduling_status_events` (`carrier`,`seq`);--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `resolution_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `status_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `status_updated_at` text;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `resolution_id` text;