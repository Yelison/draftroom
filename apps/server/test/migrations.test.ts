import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateToLatest, migrationStatus } from '../src/db/migrate.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

const tablesOfTheFirstMigration = [
  'document_access',
  'document_states',
  'documents',
  'folders',
  'memberships',
  'pins',
  'sessions',
  'users',
  'workspaces',
]

let database: TestDatabase
beforeAll(async () => {
  database = await provisionDatabase({ migrated: false })
})
afterAll(async () => {
  await database.drop()
})

async function tablesOf(): Promise<string[]> {
  const { rows } = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name not like 'kysely_%' order by table_name`.execute(database.db)
  return rows.map((row) => row.table_name)
}

// One database, and the steps in order: each test is the state the previous one left.
describe('the migrations, on a database that starts empty', () => {
  it('start with nothing in it, and report that the migrations are pending', async () => {
    expect(await tablesOf()).toEqual([])
    expect(await migrationStatus(database.db)).toEqual({
      current: false,
      reason: expect.stringContaining('0001_initial'),
    })
  })

  it('create the schema of the first migration and say which ones ran', async () => {
    expect(await migrateToLatest(database.db)).toEqual(['0001_initial'])
    expect(await tablesOf()).toEqual(tablesOfTheFirstMigration)
    expect(await migrationStatus(database.db)).toEqual({ current: true })
  })

  it('do nothing the second time', async () => {
    expect(await migrateToLatest(database.db)).toEqual([])
    expect(await tablesOf()).toEqual(tablesOfTheFirstMigration)
  })

  it('are not current when the database has a migration this server does not know', async () => {
    await sql`insert into kysely_migration (name, timestamp) values ('0002_from_a_newer_server', now()::text)`.execute(
      database.db,
    )

    expect(await migrationStatus(database.db)).toEqual({
      current: false,
      reason: expect.stringContaining('0002_from_a_newer_server'),
    })
  })
})
