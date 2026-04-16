import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import type { DbInstance } from './index'
import { join } from 'path'

export function runMigrations({ db }: DbInstance): void {
	migrate(db, { migrationsFolder: join(import.meta.dir, '../drizzle') })
}
