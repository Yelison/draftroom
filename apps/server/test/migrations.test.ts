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
      '0006_user_preferences',
      '0007_millisecond_order_indexes',
      '0008_session_activity',
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

      expect(await migrateToLatest(populated.db)).toEqual([
        '0004_versions',
        '0005_activity_events_workspace_idx',
        '0006_user_preferences',
        '0007_millisecond_order_indexes',
        '0008_session_activity',
      ])

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

describe('the seventh migration, on a database that already holds events and versions', () => {
  const indexesOf = async (db: TestDatabase['db']): Promise<Record<string, string>> => {
    const { rows } = await sql<{ indexname: string; indexdef: string }>`
      select indexname, indexdef from pg_indexes
      where tablename in ('activity_events', 'document_versions') order by indexname`.execute(db)
    return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]))
  }

  it('swaps the indexes of the history for the ones of the millisecond order, keeps the one the versions still need, and leaves the rows', async () => {
describe('the migration of the session activity, on a database that already holds a session', () => {
  it('gives the session the time of the migration as its last activity and leaves the rest of it', async () => {
    const populated = await provisionDatabase({ migrated: false })
    try {
      const { error } = await new Migrator({ db: populated.db, provider: migrationProvider }).migrateTo(
        '0005_activity_events_workspace_idx',
      )
      expect(error).toBeUndefined()
      const workspace = await createPopulatedWorkspace(populated.db)
      await populated.db
        .insertInto('document_versions')
        .values({
          workspace_id: workspace.id,
          document_id: workspace.documentId,
          kind: 'auto',
          state: Uint8Array.of(0, 0),
        })
        .execute()
      await populated.db
        .insertInto('activity_events')
        .values({ workspace_id: workspace.id, document_id: workspace.documentId, type: 'document.created' })
        .execute()
      const eventsBefore = await populated.db.selectFrom('activity_events').select('id').execute()
      expect(eventsBefore).toHaveLength(1)
      const before = await indexesOf(populated.db)

      expect(await migrateToLatest(populated.db)).toEqual(['0006_user_preferences', '0007_millisecond_order_indexes'])

      const after = await indexesOf(populated.db)
      expect(Object.keys(after).filter((name) => !(name in before))).toEqual([
        'activity_events_document_ms_idx',
        'activity_events_workspace_ms_idx',
        'document_versions_document_ms_idx',
      ])
      expect(Object.keys(before).filter((name) => !(name in after))).toEqual([
        'activity_events_document_idx',
        'activity_events_workspace_idx',
      ])
      expect(after['document_versions_document_idx']).toBe(before['document_versions_document_idx'])
      expect(await populated.db.selectFrom('activity_events').select('id').execute()).toEqual(eventsBefore)
      expect(await populated.db.selectFrom('document_versions').select('id').execute()).toHaveLength(1)

      // Going back is a new migration, and it creates the two indexes again as `0002` and `0005` wrote them: from those
      // statements the result is what the migrations had made.
      await sql`create index activity_events_workspace_idx on activity_events (workspace_id, created_at desc, id desc)`.execute(
        populated.db,
      )
      await sql`create index activity_events_document_idx on activity_events (workspace_id, document_id, created_at, id)`.execute(
        populated.db,
      )
      expect(await indexesOf(populated.db)).toEqual({ ...after, ...before })
      const expiresAt = new Date(Date.now() + 60_000)
      await sql`insert into sessions (user_id, token_hash, expires_at) values (${workspace.userId}, ${Uint8Array.of(1, 2, 3)}, ${expiresAt})`.execute(
        populated.db,
      )

      // Whatever other migrations stand between `0005` and the latest also run: this one is the one that matters here.
      expect(await migrateToLatest(populated.db)).toContain('0008_session_activity')

      const sessions = await populated.db
        .selectFrom('sessions')
        .select(['user_id', 'expires_at', 'last_seen_at'])
        .execute()
      expect(sessions).toEqual([{ user_id: workspace.userId, expires_at: expiresAt, last_seen_at: expect.any(Date) }])
      // The default is the moment of the migration, so a session that was open is not expired by being migrated.
      expect(sessions[0]?.last_seen_at.getTime()).toBeGreaterThan(Date.now() - 60_000)
    } finally {
      await populated.drop()
    }
  })
})
