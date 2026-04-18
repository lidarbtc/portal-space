CREATE TABLE `interactive_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`type` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`owner_id` text,
	`placed_at` integer NOT NULL,
	`state` text
);
--> statement-breakpoint
CREATE INDEX `idx_interactive_objects_room_owner_placed` ON `interactive_objects` (`room_id`,`owner_id`,`placed_at`);