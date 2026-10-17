import { CompiledQuery, sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { activityPageQuery, type ActivitySearch } from '../src/db/activity-feed.ts'
import type { Database } from '../src/db/tables.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// The history of a workspace reads the events of all its documents in order of the millisecond and then of `id`, and the
// history of a document reads one document's. An index serves that order only if it holds the same expression
// (`0007`): with any other the answer would be right and slow, so no other test would notice. This asks PostgreSQL for
// the plan on a workspace with tens of thousands of events, as the planner would choose it, and requires the indexes of
// `0007` and no sort: the order comes out of the index and the page is cut as soon as it is full.

const documentCount = 150
const eventCount = 30_000

let database: TestDatabase
let db: Kysely<Database>
let workspaceId: string
let member: Person
let owner: Person
let readableDocumentId: string
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  member = await createPerson(db, 'Priya Raman')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, member)
  const documentIds: string[] = []
  for (let index = 0; index < documentCount; index++) {
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    // A third of the documents are open to the member: what they can read is a part of the workspace, not all of it.
    if (index % 3 === 0) await grant(db, { workspaceId, documentId, person: member, role: 'viewer' })
    documentIds.push(documentId)
  }
  readableDocumentId = documentIds[0] ?? ''
  // Fixed instants, not `now()`: the plan depends on how many events the filters leave, and the cursor and the start of the
  // period below sit inside this range. Counted from the clock, the range would drift away from them with time, they would
  // leave few rows, and the planner would then rightly read those few and sort them: a plan that is correct and fast and
  // that this test would call a failure. These events run from 12:00 on 13 October 2026 back about 104 days, whenever it runs.
  await sql`
    insert into activity_events (workspace_id, document_id, type, actor_id, created_at)
    select ${workspaceId}::uuid, (array[${sql.join(documentIds)}]::uuid[])[1 + (n % ${documentCount})],
      'document.renamed', ${owner.id}::uuid, timestamptz '2026-10-13T12:00:00Z' - n * interval '5 minutes'
    from generate_series(1, ${eventCount}) n`.execute(db)
  await sql`analyze`.execute(db)
}, 120_000)
afterAll(() => database.drop())

async function planOf(search: Partial<ActivitySearch>): Promise<string> {
  const compiled = activityPageQuery(db, { userId: member.id, workspaceId, limit: 25, ...search }).compile()
  const { rows } = await db.executeQuery<{ 'QUERY PLAN': string }>(
    CompiledQuery.raw(`explain ${compiled.sql}`, [...compiled.parameters]),
  )
  return rows.map((row) => row['QUERY PLAN']).join('\n')
}

describe('the plan of the history of a workspace', () => {
  it.each([
    ['without filters', () => ({})],
    ['from an instant', () => ({ from: '2026-01-01T00:00:00Z' })],
    [
      'after a cursor',
      () => ({ after: { timestamp: '2026-10-13T10:00:00.000000Z', id: '00000000-0000-4000-8000-000000000001' } }),
    ],
    ['for one person', () => ({ actorId: owner.id })],
    ['for one person from an instant', () => ({ actorId: owner.id, from: '2026-01-01T00:00:00Z' })],
  ])('walks the index of the workspace in order and sorts nothing, %s', async (_name, filters) => {
    const plan = await planOf(filters())

    expect(plan).toContain('activity_events_workspace_ms_idx')
    expect(plan).not.toMatch(/Sort/)
  })
})

// A filter by an instant on the column is not a condition of the index on the cut instant: without a bound on that
// expression, the index is walked from the newest event and every event after `to` is read and thrown away.
describe('the plan of the history of a workspace, with a filter by instant that cuts the range', () => {
  const cursor = { timestamp: '2026-08-10T10:00:00.000000Z', id: '00000000-0000-4000-8000-000000000001' }
  it.each([
    ['until an instant', () => ({ to: '2026-08-01T00:00:00Z' })],
    ['for one person until an instant', () => ({ actorId: owner.id, to: '2026-08-01T00:00:00Z' })],
    ['until an instant, after a cursor', () => ({ to: '2026-08-20T00:00:00Z', after: cursor })],
  ])('has the range in the condition of the index and sorts nothing, %s', async (_name, filters) => {
    const plan = await planOf(filters())

    expect(plan).toContain('activity_events_workspace_ms_idx')
    expect(plan).toMatch(/Index Cond: .*date_trunc/)
    expect(plan).not.toMatch(/Sort/)
  })

  it('has both ends of a window in the condition of the index', async () => {
    const plan = await planOf({ from: '2026-07-20T00:00:00Z', to: '2026-08-01T00:00:00Z' })

    const condition = plan.split('\n').find((line) => line.includes('Index Cond')) ?? ''
    expect(plan).toContain('activity_events_workspace_ms_idx')
    expect(condition).toMatch(/date_trunc.*>=/)
    expect(condition).toMatch(/date_trunc.*<=/)
    expect(plan).not.toMatch(/Sort/)
  })
})

describe('the plan of the history of a document', () => {
  it.each([
    ['without filters', () => ({})],
    [
      'after a cursor',
      () => ({ after: { timestamp: '2026-10-13T10:00:00.000000Z', id: '00000000-0000-4000-8000-000000000001' } }),
    ],
  ])('walks the index of the document in order and sorts nothing, %s', async (_name, filters) => {
    const plan = await planOf({ documentId: readableDocumentId, ...filters() })

    expect(plan).toContain('activity_events_document_ms_idx')
    expect(plan).not.toMatch(/Sort/)
  })

  it('finds the events of a document by its workspace and id, which is all the deletion of the document asks', async () => {
    const { rows } = await db.executeQuery<{ 'QUERY PLAN': string }>(
      CompiledQuery.raw(
        `explain delete from activity_events where workspace_id = '${workspaceId}' and document_id = '${readableDocumentId}'`,
      ),
    )

    expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toContain('activity_events_document_ms_idx')
  })
})
