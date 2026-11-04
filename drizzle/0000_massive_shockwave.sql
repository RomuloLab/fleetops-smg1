CREATE TABLE `availability` (
	`id` text PRIMARY KEY NOT NULL,
	`carrier` text NOT NULL,
	`date` text NOT NULL,
	`cycle` text NOT NULL,
	`utilitarios` integer NOT NULL,
	`vans` integer NOT NULL,
	`vucs` integer NOT NULL,
	`outros` integer NOT NULL,
	`contact` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_carrier_date_cycle` ON `availability` (`carrier`,`date`,`cycle`);