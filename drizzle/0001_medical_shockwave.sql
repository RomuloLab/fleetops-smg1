CREATE TABLE `carrier_modals` (
	`id` text PRIMARY KEY NOT NULL,
	`carrier` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carrier_modals_carrier_code` ON `carrier_modals` (`carrier`,`code`);--> statement-breakpoint
CREATE TABLE `scheduling_requests` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`carrier` text NOT NULL,
	`date` text NOT NULL,
	`cycle` text NOT NULL,
	`modal_id` text NOT NULL,
	`modal_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`contact` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`modal_id`) REFERENCES `carrier_modals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduling_requests_id` ON `scheduling_requests` (`id`);--> statement-breakpoint
CREATE INDEX `scheduling_requests_operation` ON `scheduling_requests` (`carrier`,`date`,`cycle`);