CREATE TABLE `attendance_issue` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`justification` text,
	`status` text DEFAULT 'open' NOT NULL,
	`verified_by` text,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employee`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_issue_uq` ON `attendance_issue` (`employee_id`,`date`,`type`);--> statement-breakpoint
CREATE TABLE `leave_request` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decision_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employee`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_type`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `leave_type` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`quota_days` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_type_org_name_uq` ON `leave_type` (`organization_id`,`name`);--> statement-breakpoint
ALTER TABLE `employee` ADD `supervisor_id` text REFERENCES employee(id);