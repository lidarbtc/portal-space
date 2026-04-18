import { sqliteTable, text, blob, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

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
