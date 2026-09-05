CREATE TABLE `platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_name` text,
	`bank_account` text,
	`account_holder` text,
	`contact_email` text,
	`qr_base64` text,
	`updated_at` integer NOT NULL
);
