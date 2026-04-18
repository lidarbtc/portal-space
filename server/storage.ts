import type { InteractiveObject } from '@shared/types'
import { and, asc, eq } from 'drizzle-orm'
import { createDb, type DbInstance } from './db'
import { runMigrations } from './db/migrate'
import { interactiveObjects, yjsDocuments, zoneChatLogs } from './db/schema'

// A persisted InteractiveObject row, with room / owner / placement metadata.
// `ownerId` is null for Tiled-seeded overrides (unused in v1 but reserved).
export interface StoredObject extends InteractiveObject {
	roomId: string
	ownerId: string
	placedAt: number
}

export interface ChatLogEntry {
	zoneId: string
	senderClientId: string
	senderNickname: string
	text: string
	createdAt: number
}

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

	// --- Interactive objects (v1 runtime-placed) ---

	insertObject(obj: StoredObject): void {
		this.#dbInstance.db
			.insert(interactiveObjects)
			.values({
				id: obj.id,
				roomId: obj.roomId,
				type: obj.type,
				x: Math.trunc(obj.x),
				y: Math.trunc(obj.y),
				ownerId: obj.ownerId,
				placedAt: obj.placedAt,
				state:
					obj.state === undefined || obj.state === null
						? null
						: JSON.stringify(obj.state),
			})
			.run()
	}

	deleteObject(id: string): void {
		this.#dbInstance.db.delete(interactiveObjects).where(eq(interactiveObjects.id, id)).run()
	}

	listObjectsByRoom(roomId: string): StoredObject[] {
		const rows = this.#dbInstance.db
			.select()
			.from(interactiveObjects)
			.where(eq(interactiveObjects.roomId, roomId))
			.orderBy(asc(interactiveObjects.placedAt))
			.all()
		return rows.map(rowToStoredObject)
	}

	listObjectsByOwner(roomId: string, ownerId: string): StoredObject[] {
		const rows = this.#dbInstance.db
			.select()
			.from(interactiveObjects)
			.where(
				and(eq(interactiveObjects.roomId, roomId), eq(interactiveObjects.ownerId, ownerId)),
			)
			.orderBy(asc(interactiveObjects.placedAt))
			.all()
		return rows.map(rowToStoredObject)
	}

	// --- Regional zone chat log (append-only) ---

	// 동기 insert. upsertDocumentAsync(setImmediate) 패턴은 Y.js 바이너리(수~수백 KB)
	// 최적화용이며 채팅 텍스트(수십 바이트)에는 불필요. 동기 insert로 결정적 순서를 확보하는 것이
	// 단순성/디버깅 측면에서 유리하다. busy_timeout worst-case 5s는 fail-open으로 보호.
	appendChatLog(entry: ChatLogEntry): void {
		try {
			this.#dbInstance.db.insert(zoneChatLogs).values(entry).run()
		} catch (err) {
			console.error('[storage] appendChatLog failed', { zoneId: entry.zoneId, err })
		}
	}

	close(): void {
		this.#dbInstance.client.close()
	}
}

function rowToStoredObject(row: {
	id: string
	roomId: string
	type: string
	x: number
	y: number
	ownerId: string | null
	placedAt: number
	state: string | null
}): StoredObject {
	let state: unknown = null
	if (row.state !== null) {
		try {
			state = JSON.parse(row.state)
		} catch {
			state = null
		}
	}
	return {
		id: row.id,
		roomId: row.roomId,
		type: row.type,
		x: row.x,
		y: row.y,
		ownerId: row.ownerId ?? '',
		placedAt: row.placedAt,
		state,
	}
}
