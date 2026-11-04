ALTER TABLE `scheduling_requests` ADD `license_plates` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduling_requests` ADD `calendar_vehicles` text DEFAULT '[]' NOT NULL;