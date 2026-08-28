CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_sen` integer NOT NULL,
	`balance_after_sen` integer NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `plan` text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `pending_plan` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `balance_sen` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `paid_until` integer;