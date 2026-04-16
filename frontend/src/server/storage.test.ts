import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Storage } from './storage'
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
		const tables = storage.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='yjs_documents'",
		)
		expect(tables).toHaveLength(1)
	})

	it('inserts and reads yjs document', () => {
		storage.write(
			'INSERT INTO yjs_documents (board_id, doc_state) VALUES (?, ?)',
			'wb-1',
			Buffer.from([1, 2, 3]),
		)

		const rows = storage.query<{ board_id: string; doc_state: Buffer }>(
			'SELECT board_id, doc_state FROM yjs_documents WHERE board_id = ?',
			'wb-1',
		)
		expect(rows).toHaveLength(1)
		expect(rows[0].board_id).toBe('wb-1')
		expect(Buffer.from(rows[0].doc_state)).toEqual(Buffer.from([1, 2, 3]))
	})

	it('upserts yjs document', () => {
		storage.write(
			'INSERT INTO yjs_documents (board_id, doc_state) VALUES (?, ?)',
			'wb-1',
			Buffer.from([1]),
		)
		storage.write(
			`INSERT INTO yjs_documents (board_id, doc_state, updates_blob)
			 VALUES (?, ?, ?)
			 ON CONFLICT(board_id) DO UPDATE SET
			   doc_state = excluded.doc_state,
			   updates_blob = excluded.updates_blob,
			   updated_at = CURRENT_TIMESTAMP`,
			'wb-1',
			Buffer.from([2]),
			Buffer.from([3, 4]),
		)

		const rows = storage.query<{ doc_state: Buffer; updates_blob: Buffer }>(
			'SELECT doc_state, updates_blob FROM yjs_documents WHERE board_id = ?',
			'wb-1',
		)
		expect(rows).toHaveLength(1)
		expect(Buffer.from(rows[0].doc_state)).toEqual(Buffer.from([2]))
		expect(Buffer.from(rows[0].updates_blob)).toEqual(Buffer.from([3, 4]))
	})

	it('migration is idempotent', () => {
		// Creating a second Storage on the same DB should not throw
		const storage2 = new Storage(TEST_DB)
		storage2.close()
	})
})
