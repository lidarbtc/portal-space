import { sql } from 'drizzle-orm'
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const yjsDocuments = sqliteTable('yjs_documents', {
	boardId: text('board_id').primaryKey(),
	docState: blob('doc_state', { mode: 'buffer' }).notNull(),
	updatesBlob: blob('updates_blob', { mode: 'buffer' }),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
})

// Interactive objects placed at runtime (via /place chat command) or persisted
// overrides for Tiled-seeded instances. Static Tiled objects are NOT stored here
// in v1 — they are re-materialised from map.json on every boot.
export const interactiveObjects = sqliteTable(
	'interactive_objects',
	{
		id: text('id').primaryKey(), // nanoid for runtime; 'tiled:<name>' reserved for future
		roomId: text('room_id').notNull(),
		type: text('type').notNull(),
		x: integer('x').notNull(),
		y: integer('y').notNull(),
		ownerId: text('owner_id'),
		placedAt: integer('placed_at').notNull(),
		state: text('state'),
	},
	(table) => ({
		byOwner: index('idx_interactive_objects_room_owner_placed').on(
			table.roomId,
			table.ownerId,
			table.placedAt,
		),
	}),
)

// Append-only log of text chat messages in regional zones where
// retainHistory is enabled. Images, system messages, and global chat are
// intentionally excluded — see `#persistZoneChat` in server/room.ts.
export const zoneChatLogs = sqliteTable(
	'zone_chat_logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		zoneId: text('zone_id').notNull(),
		senderClientId: text('sender_client_id').notNull(),
		senderNickname: text('sender_nickname').notNull(),
		text: text('text').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => ({
		byZoneCreated: index('idx_zone_chat_zone_created').on(t.zoneId, t.createdAt),
	}),
)
