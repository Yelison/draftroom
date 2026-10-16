import { sql } from 'kysely'
import { Migrator } from 'kysely/migration'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateToLatest, migrationStatus } from '../src/db/migrate.ts'
import { migrationProvider } from '../src/db/migrations/index.ts'
import { createPopulatedWorkspace } from './support/fixtures.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

const tablesOfTheMigrations = [
  'activity_events',
  'comments',
  'document_access',
  'document_states',
  'document_versions',
  'documents',
  'folders',
  'memberships',
  'pins',
  'sessions',
  'threads',
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

  it('create the schema and say which ones ran', async () => {
    expect(await migrateToLatest(database.db)).toEqual([
      '0001_initial',
      '0002_activity_events',
      '0003_comments',
      '0004_versions',
      '0005_activity_events_workspace_idx',
    ])
    expect(await tablesOf()).toEqual(tablesOfTheMigrations)
    expect(await migrationStatus(database.db)).toEqual({ current: true })
  })

  it('do nothing the second time', async () => {
    expect(await migrateToLatest(database.db)).toEqual([])
    expect(await tablesOf()).toEqual(tablesOfTheMigrations)
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

describe('the second migration, on a database that already holds documents', () => {
  it('adds the history and leaves what was there', async () => {
    const populated = await provisionDatabase({ migrated: false })
    try {
      const { error } = await new Migrator({ db: populated.db, provider: migrationProvider }).migrateTo('0001_initial')
      expect(error).toBeUndefined()
      const workspace = await createPopulatedWorkspace(populated.db)

      const migrator = new Migrator({ db: populated.db, provider: migrationProvider })
      expect((await migrator.migrateTo('0002_activity_events')).error).toBeUndefined()

      const documents = await populated.db.selectFrom('documents').select('id').execute()
      const events = await populated.db.selectFrom('activity_events').select('id').execute()
      expect([documents, events]).toEqual([[{ id: workspace.documentId }], []])
    } finally {
      await populated.drop()
    }
  })
})

describe('the third migration, on a database that already holds documents and their history', () => {
  it('adds the comments and leaves what was there', async () => {
    const populated = await provisionDatabase({ migrated: false })
    try {
      const { error } = await new Migrator({ db: populated.db, provider: migrationProvider }).migrateTo(
        '0002_activity_events',
      )
      expect(error).toBeUndefined()
      const workspace = await createPopulatedWorkspace(populated.db)
      await populated.db
        .insertInto('activity_events')
        .values({
          workspace_id: workspace.id,
          document_id: workspace.documentId,
          type: 'document.created',
          actor_id: workspace.userId,
        })
        .execute()

      expect(
        (await new Migrator({ db: populated.db, provider: migrationProvider }).migrateTo('0003_comments')).error,
      ).toBeUndefined()

      const documents = await populated.db.selectFrom('documents').select('id').execute()
      const events = await populated.db.selectFrom('activity_events').select('type').execute()
      const threads = await populated.db.selectFrom('threads').select('id').execute()
      const comments = await populated.db.selectFrom('comments').select('id').execute()
      expect([documents, events, threads, comments]).toEqual([
        [{ id: workspace.documentId }],
        [{ type: 'document.created' }],
        [],
        [],
      ])
    } finally {
      await populated.drop()
    }
  })
})

describe('the fourth migration, on a database that already holds documents and their comments', () => {
  it('adds the versions and leaves what was there, a stored state included', async () => {
    const populated = await provisionDatabase({ migrated: false })
    try {
      const { error } = await new Migrator({ db: populated.db, provider: migrationProvider }).migrateTo('0003_comments')
      expect(error).toBeUndefined()
      const workspace = await createPopulatedWorkspace(populated.db)
      await populated.db
        .insertInto('document_states')
        .values({ workspace_id: workspace.id, document_id: workspace.documentId, state: Uint8Array.of(0, 0) })
        .execute()

      expect(await migrateToLatest(populated.db)).toEqual(['0004_versions'])

      const states = await populated.db
        .selectFrom('document_states')
        .select(['document_id', 'versions_checked_at'])
        .execute()
      const versions = await populated.db.selectFrom('document_versions').select('id').execute()
      expect([states, versions]).toEqual([[{ document_id: workspace.documentId, versions_checked_at: null }], []])
    } finally {
      await populated.drop()
    }
  })
})
