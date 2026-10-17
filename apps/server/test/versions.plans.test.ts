import { CompiledQuery, sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { versionsPageQuery, type VersionSearch } from '../src/db/versions/queries.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join } from './support/world.ts'

// The versions of a document come in order of the millisecond and then of `id`, newest first. An index serves that order
// only if it holds the same expression (`0007`): with the index of `0004` the answer would be right and slow, since the
// database would read and sort every version of the document, and no other test would notice. This asks PostgreSQL for
// the plan on a document with thousands of versions and requires the index of `0007` and no sort.

const versionCount = 5_000

let database: TestDatabase
let db: Kysely<Database>
let workspaceId: string
let documentId: string
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
  documentId = await createDocument(db, { workspaceId, creator: owner })
  // Fixed instants, not `now()`: the cursor below sits inside this range.
  await sql`
    insert into document_versions (workspace_id, document_id, kind, created_by, state, created_at)
    select ${workspaceId}::uuid, ${documentId}::uuid, 'auto', null, '\\x0000'::bytea,
      timestamptz '2026-10-13T12:00:00Z' - n * interval '10 minutes'
    from generate_series(1, ${versionCount}) n`.execute(db)
  await sql`analyze`.execute(db)
}, 120_000)
afterAll(() => database.drop())

async function planOf(search: Partial<VersionSearch>): Promise<string> {
  const compiled = versionsPageQuery(db, { workspaceId, documentId, limit: 25, ...search }).compile()
  const { rows } = await db.executeQuery<{ 'QUERY PLAN': string }>(
    CompiledQuery.raw(`explain ${compiled.sql}`, [...compiled.parameters]),
  )
  return rows.map((row) => row['QUERY PLAN']).join('\n')
}

describe('the plan of the versions of a document', () => {
  it.each([
    ['without a cursor', {}],
    [
      'after a cursor',
      { after: { timestamp: '2026-10-10T10:00:00.000000Z', id: '00000000-0000-4000-8000-000000000001' } },
    ],
  ])('walks the index of the document in order and sorts nothing, %s', async (_name, search) => {
    const plan = await planOf(search)

    expect(plan).toContain('document_versions_document_ms_idx')
    expect(plan).not.toMatch(/Sort/)
  })
})
