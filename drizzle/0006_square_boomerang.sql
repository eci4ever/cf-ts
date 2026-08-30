CREATE TABLE `work_site` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real,
	`lng` real,
	`radius_m` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `attendance` ADD `site_id` text REFERENCES work_site(id);--> statement-breakpoint
ALTER TABLE `attendance` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `distance_m` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `location_status` text;--> statement-breakpoint
ALTER TABLE `attendance` ADD `clock_out_lat` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `clock_out_lng` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `clock_out_distance_m` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `clock_out_location_status` text;--> statement-breakpoint
ALTER TABLE `employee` ADD `site_id` text REFERENCES work_site(id);--> statement-breakpoint
ALTER TABLE `organization` ADD `geofence_enabled` integer DEFAULT false NOT NULL;