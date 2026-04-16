import { Database } from 'bun:sqlite'

export class Storage {
	#db: Database

	constructor(dbPath: string) {
		this.#db = new Database(dbPath)
		this.#db.exec('PRAGMA journal_mode = WAL')
		this.#db.exec('PRAGMA busy_timeout = 5000')
		this.#migrate()
	}

	#migrate(): void {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS yjs_documents (
				board_id TEXT PRIMARY KEY,
				doc_state BLOB NOT NULL,
				updates_blob BLOB,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)
		// Migration for existing databases: add updates_blob column if missing
		try {
			this.#db.exec('ALTER TABLE yjs_documents ADD COLUMN updates_blob BLOB')
		} catch {
			// Column already exists — ignore
		}
	}

	write(
		query: string,
		...args: (string | number | boolean | null | Buffer | Uint8Array)[]
	): void {
		this.#db.run(query, args as never)
	}

	/** Non-blocking write — defers SQLite execution off the hot path (matches Go's WriteAsync) */
	writeAsync(
		query: string,
		...args: (string | number | boolean | null | Buffer | Uint8Array)[]
	): void {
		setImmediate(() => {
			try {
				this.#db.run(query, args as never)
			} catch (e) {
				console.warn('[storage] async write failed:', e)
			}
		})
	}

	query<T = Record<string, unknown>>(
		sql: string,
		...args: (string | number | boolean | null | Buffer | Uint8Array)[]
	): T[] {
		return this.#db.query(sql).all(args as never) as T[]
	}

	close(): void {
		this.#db.close()
	}
}
