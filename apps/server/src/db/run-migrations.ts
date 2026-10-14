import { ConfigError, loadDatabaseUrl } from '../config.ts'
import { createDatabase } from './database.ts'
import { migrateToLatest } from './migrate.ts'

// `npm run migrate`: brings the database up to date and exits. Nothing else migrates, so a deployment decides when.

try {
  const database = createDatabase(loadDatabaseUrl())
  try {
    const applied = await migrateToLatest(database)
    console.log(applied.length === 0 ? 'The database is up to date.' : `Applied: ${applied.join(', ')}`)
  } finally {
    await database.destroy()
  }
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error)
  process.exitCode = 1
}
