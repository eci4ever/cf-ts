CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`clock_in` integer NOT NULL,
	`clock_in_status` text NOT NULL,
	`clock_out` integer,
	`clock_out_status` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employee`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_org_employee_date_uq` ON `attendance` (`organization_id`,`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `employee` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`employee_no` text NOT NULL,
	`position` text,
	`shift` text DEFAULT 'normal' NOT NULL,
	`joined_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_org_no_uq` ON `employee` (`organization_id`,`employee_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_org_user_uq` ON `employee` (`organization_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `organization` ADD `work_days` text DEFAULT '1,2,3,4,5' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `work_start_minutes` integer DEFAULT 540 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `work_end_minutes` integer DEFAULT 1080 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `grace_minutes` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `timezone` text DEFAULT 'Asia/Kuala_Lumpur' NOT NULL;