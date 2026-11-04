CREATE TABLE `email_auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `email_auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_auth_accounts_user` ON `email_auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `email_auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_auth_sessions_token` ON `email_auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `email_auth_sessions_user` ON `email_auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_auth_users_email` ON `email_auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `email_auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_auth_verifications_identifier` ON `email_auth_verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `email_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`manager_id` text,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `mail_deliveries_manager` ON `mail_deliveries` (`manager_id`);--> statement-breakpoint
CREATE TABLE `mail_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`from_email` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`change_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `manager_users` ADD `email_verified_at` text;--> statement-breakpoint
ALTER TABLE `manager_users` ADD `invite_status` text DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `manager_users` ADD `invite_sent_at` text;--> statement-breakpoint
ALTER TABLE `manager_users` ADD `invite_error` text DEFAULT '' NOT NULL;