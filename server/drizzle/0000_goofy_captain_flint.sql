CREATE TABLE `yjs_documents` (
	`board_id` text PRIMARY KEY NOT NULL,
	`doc_state` blob NOT NULL,
	`updates_blob` blob,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
