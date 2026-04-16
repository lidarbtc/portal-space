import { eq } from 'drizzle-orm'
import { createDb, type DbInstance } from './db'
import { runMigrations } from './db/migrate'
import { yjsDocuments } from './db/schema'

export class Storage {
	#dbInstance: DbInstance

	constructor(dbPath: string) {
		this.#dbInstance = createDb(dbPath)
		runMigrations(this.#dbInstance)
	}

	get db() {
		return this.#dbInstance.db
	}

	getDocument(boardId: string): { docState: Buffer; updatesBlob: Buffer | null } | undefined {
		const row = this.#dbInstance.db
			.select({
				docState: yjsDocuments.docState,
				updatesBlob: yjsDocuments.updatesBlob,
			})
			.from(yjsDocuments)
			.where(eq(yjsDocuments.boardId, boardId))
			.get()

		if (!row) return undefined
		return {
			docState: Buffer.from(row.docState),
			updatesBlob: row.updatesBlob ? Buffer.from(row.updatesBlob) : null,
		}
	}

	upsertDocument(
		boardId: string,
		docState: Buffer | Uint8Array,
		updatesBlob: Buffer | Uint8Array | null,
	): void {
		this.#dbInstance.db
			.insert(yjsDocuments)
			.values({
				boardId,
				docState: Buffer.from(docState),
				updatesBlob: updatesBlob ? Buffer.from(updatesBlob) : null,
			})
			.onConflictDoUpdate({
				target: yjsDocuments.boardId,
				set: {
					docState: Buffer.from(docState),
					updatesBlob: updatesBlob ? Buffer.from(updatesBlob) : null,
					updatedAt: new Date().toISOString(),
				},
			})
			.run()
	}

	upsertDocumentAsync(
		boardId: string,
		docState: Buffer | Uint8Array,
		updatesBlob: Buffer | Uint8Array | null,
	): void {
		setImmediate(() => {
			try {
				this.upsertDocument(boardId, docState, updatesBlob)
			} catch (e) {
				console.warn('[storage] async upsert failed:', e)
			}
		})
	}

	close(): void {
		this.#dbInstance.client.close()
	}
}
