import { sql, type Kysely } from 'kysely'
import { Migrator } from 'kysely/migration'
import { migrationProvider, migrations } from './migrations/index.ts'

const createMigrator = <DB>(db: Kysely<DB>): Migrator => new Migrator({ db, provider: migrationProvider })

/** Runs every migration that has not run yet and returns their names. Throws if any of them fails. */
export async function migrateToLatest<DB>(db: Kysely<DB>): Promise<readonly string[]> {
  const { error, results } = await createMigrator(db).migrateToLatest()
  const failed = results?.find((result) => result.status === 'Error')
  if (failed !== undefined) throw new Error(`Migration ${failed.migrationName} failed`, { cause: error })
  if (error !== undefined) throw new Error('Migrating the database failed', { cause: error })
  return (results ?? []).filter((result) => result.status === 'Success').map((result) => result.migrationName)
}

export type MigrationStatus = { readonly current: true } | { readonly current: false; readonly reason: string }

/** The names of the migrations the database has run: Kysely's `getMigrations()` only reports the ones it knows. */
async function executedMigrationNames<DB>(db: Kysely<DB>): Promise<string[]> {
  const { rows: tables } = await sql<{
    present: boolean
  }>`select to_regclass('kysely_migration') is not null as present`.execute(db)
  if (tables[0]?.present !== true) return []
  const { rows } = await sql<{ name: string }>`select name from kysely_migration`.execute(db)
  return rows.map((row) => row.name)
}

/**
 * Whether the database holds exactly the migrations this server knows. Anything else is not current: migrations still
 * to run, but also migrations the database has and this server lacks, which means a newer or a different server
 * migrated it (and `migrateToLatest` would refuse to go on).
 */
export async function migrationStatus<DB>(db: Kysely<DB>): Promise<MigrationStatus> {
  try {
    const unknown = (await executedMigrationNames(db)).filter((name) => !(name in migrations))
    if (unknown.length > 0) {
      return { current: false, reason: `the database has migrations this server does not know: ${unknown.join(', ')}` }
    }
    const pending = (await createMigrator(db).getMigrations()).filter((migration) => migration.executedAt === undefined)
    return pending.length === 0
      ? { current: true }
      : { current: false, reason: `pending migrations: ${pending.map((migration) => migration.name).join(', ')}` }
  } catch (error) {
    return { current: false, reason: error instanceof Error ? error.message : 'the migration history is unreadable' }
  }
}
