import { sqliteTable, text, blob } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const yjsDocuments = sqliteTable('yjs_documents', {
	boardId: text('board_id').primaryKey(),
	docState: blob('doc_state', { mode: 'buffer' }).notNull(),
	updatesBlob: blob('updates_blob', { mode: 'buffer' }),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
})
