CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link_path` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
