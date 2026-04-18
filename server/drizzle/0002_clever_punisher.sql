CREATE TABLE `zone_chat_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` text NOT NULL,
	`sender_client_id` text NOT NULL,
	`sender_nickname` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_zone_chat_zone_created` ON `zone_chat_logs` (`zone_id`,`created_at`);