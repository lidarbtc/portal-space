import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export function createDb(dbPath: string) {
	const client = new Database(dbPath)
	client.exec('PRAGMA journal_mode = WAL')
	client.exec('PRAGMA busy_timeout = 5000')
	const db = drizzle(client, { schema })
	return { db, client }
}

export type DbInstance = ReturnType<typeof createDb>
