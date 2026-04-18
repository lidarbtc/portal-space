import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, unlinkSync } from 'fs'
import { Storage } from './storage'

const TEST_DB = '/tmp/portal-space-test.db'

function cleanup() {
	for (const suffix of ['', '-wal', '-shm']) {
		const path = TEST_DB + suffix
		if (existsSync(path)) unlinkSync(path)
	}
}

describe('Storage', () => {
	let storage: Storage

	beforeEach(() => {
		cleanup()
		storage = new Storage(TEST_DB)
	})

	afterEach(() => {
		storage.close()
		cleanup()
	})

	it('creates yjs_documents table on init', () => {
		// If we can upsert and retrieve without error, the table exists
		storage.upsertDocument('init-test', Buffer.from([1]), null)
		const doc = storage.getDocument('init-test')
		expect(doc).toBeDefined()
	})

	it('inserts and reads yjs document', () => {
		storage.upsertDocument('wb-1', Buffer.from([1, 2, 3]), null)

		const doc = storage.getDocument('wb-1')
		expect(doc).toBeDefined()
		expect(Buffer.from(doc!.docState)).toEqual(Buffer.from([1, 2, 3]))
		expect(doc!.updatesBlob).toBeNull()
	})

	it('upserts yjs document', () => {
		storage.upsertDocument('wb-1', Buffer.from([1]), null)
		storage.upsertDocument('wb-1', Buffer.from([2]), Buffer.from([3, 4]))

		const doc = storage.getDocument('wb-1')
		expect(doc).toBeDefined()
		expect(Buffer.from(doc!.docState)).toEqual(Buffer.from([2]))
		expect(Buffer.from(doc!.updatesBlob!)).toEqual(Buffer.from([3, 4]))
	})

	it('migration is idempotent', () => {
		// Creating a second Storage on the same DB should not throw
		const storage2 = new Storage(TEST_DB)
		storage2.close()
	})

	it('round-trips binary data without corruption', () => {
		const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f])
		storage.upsertDocument('blob-test', binary, null)
		const doc = storage.getDocument('blob-test')
		expect(doc).toBeDefined()
		expect(Buffer.from(doc!.docState)).toEqual(binary)
	})

	it('returns undefined for missing document', () => {
		const doc = storage.getDocument('nonexistent')
		expect(doc).toBeUndefined()
	})

	describe('interactive objects CRUD', () => {
		it('round-trips an inserted object (AC-5)', () => {
			storage.insertObject({
				id: 'obj-1',
				roomId: 'default',
				type: 'whiteboard',
				x: 100,
				y: 200,
				ownerId: 'user-1',
				placedAt: 1000,
				state: null,
			})

			const rows = storage.listObjectsByRoom('default')
			expect(rows.length).toBe(1)
			expect(rows[0].id).toBe('obj-1')
			expect(rows[0].type).toBe('whiteboard')
			expect(rows[0].x).toBe(100)
			expect(rows[0].y).toBe(200)
			expect(rows[0].ownerId).toBe('user-1')
			expect(rows[0].placedAt).toBe(1000)
			expect(rows[0].state).toBeNull()
		})

		it('round-trips object state JSON', () => {
			storage.insertObject({
				id: 'obj-2',
				roomId: 'default',
				type: 'regional_chat',
				x: 0,
				y: 0,
				ownerId: 'u2',
				placedAt: 2000,
				state: { name: 'zone', radius: 80, retainHistory: false },
			})
			const rows = storage.listObjectsByOwner('default', 'u2')
			expect(rows.length).toBe(1)
			expect(rows[0].state).toEqual({ name: 'zone', radius: 80, retainHistory: false })
		})

		it('deletes an object', () => {
			storage.insertObject({
				id: 'obj-3',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'u',
				placedAt: 1,
				state: null,
			})
			storage.deleteObject('obj-3')
			const rows = storage.listObjectsByRoom('default')
			expect(rows.length).toBe(0)
		})

		it('listObjectsByOwner returns rows in placedAt ASC order (FIFO)', () => {
			storage.insertObject({
				id: 'a',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'u',
				placedAt: 30,
				state: null,
			})
			storage.insertObject({
				id: 'b',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'u',
				placedAt: 10,
				state: null,
			})
			storage.insertObject({
				id: 'c',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'u',
				placedAt: 20,
				state: null,
			})
			const ids = storage.listObjectsByOwner('default', 'u').map((r) => r.id)
			expect(ids).toEqual(['b', 'c', 'a'])
		})

		it('persists across Storage re-open (AC-5)', () => {
			storage.insertObject({
				id: 'persist-1',
				roomId: 'default',
				type: 'whiteboard',
				x: 5,
				y: 10,
				ownerId: 'o',
				placedAt: 500,
				state: null,
			})
			storage.close()
			const storage2 = new Storage(TEST_DB)
			const rows = storage2.listObjectsByRoom('default')
			expect(rows.length).toBe(1)
			expect(rows[0].id).toBe('persist-1')
			storage2.close()
		})

		it('listObjectsByOwner filters by ownerId', () => {
			storage.insertObject({
				id: 'm1',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'alice',
				placedAt: 1,
				state: null,
			})
			storage.insertObject({
				id: 'm2',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'bob',
				placedAt: 2,
				state: null,
			})
			const alice = storage.listObjectsByOwner('default', 'alice')
			expect(alice.map((r) => r.id)).toEqual(['m1'])
		})
	})
})
