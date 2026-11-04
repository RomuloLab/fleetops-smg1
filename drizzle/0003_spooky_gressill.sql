ALTER TABLE `scheduling_requests` ADD `ambulance` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `ambulance_released_by` text DEFAULT '' NOT NULL;