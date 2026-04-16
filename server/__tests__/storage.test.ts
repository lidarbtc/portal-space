import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Storage } from '../storage'
import { unlinkSync, existsSync } from 'fs'

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
})
