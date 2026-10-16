import { CompiledQuery, sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commentsInThread, commentsOfThreads, threadsOfDocument } from '../src/db/comments/queries.ts'
import type { Database } from '../src/db/tables.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

// The indexes of `0003` lead with `workspace_id`, like every key of a workspace. A query that asks for a document or a
// thread without the workspace still returns the right rows, so no other test would notice that it has stopped using the
// index for anything but a scan of all of it. These ask PostgreSQL for the plan of each query the comments run and
// require the index and the workspace in its condition.
//
// The tables here are nearly empty, where a sequential scan always wins, so the planner is told not to choose one. That
// makes the plan show which index the query *can* use and on which columns; it says nothing of speed, and it does not
// depend on the number of rows or on the version of PostgreSQL (a version that can skip the leading column still shows
// the condition it was given).

let database: TestDatabase
let db: Kysely<Database>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
})
afterAll(() => database.drop())

const someId = '00000000-0000-4000-8000-000000000001'

async function indexConditionOf(query: { compile(): CompiledQuery }): Promise<{ plan: string; condition: string }> {
  const plan = await db.transaction().execute(async (trx) => {
    await sql`set local enable_seqscan = off`.execute(trx)
    const compiled = query.compile()
    const { rows } = await trx.executeQuery<{ 'QUERY PLAN': string }>(
      CompiledQuery.raw(`explain ${compiled.sql}`, [...compiled.parameters]),
    )
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  })
  const condition = plan.split('\n').find((line) => line.includes('Index Cond')) ?? ''
  return { plan, condition }
}

describe('the plan of a query on comments', () => {
  it.each([
    [
      'the threads of a document',
      'threads_document_idx',
      /workspace_id = .*document_id = /,
      () => threadsOfDocument(db, { workspaceId: someId, documentId: someId }),
    ],
    [
      'the open threads of a document',
      'threads_document_idx',
      /workspace_id = .*document_id = /,
      () => threadsOfDocument(db, { workspaceId: someId, documentId: someId, status: 'open' }),
    ],
    [
      'the comments of some threads',
      'comments_thread_idx',
      /workspace_id = .*thread_id = /,
      () => commentsOfThreads(db, someId, [someId, someId]),
    ],
    [
      'the count of the comments of a thread',
      'comments_thread_idx',
      /workspace_id = .*thread_id = /,
      () => commentsInThread(db, someId, someId),
    ],
  ])('for %s uses %s on the workspace and then on the thread or document', async (_what, index, condition, query) => {
    const found = await indexConditionOf(query())

    expect(found.plan).toContain(index)
    expect(found.condition).toMatch(condition)
  })
})
