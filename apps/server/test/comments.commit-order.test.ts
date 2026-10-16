import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import type { DocumentBroadcaster } from '../src/http/document-broadcaster.ts'
import { apiOf, type Call } from './support/api.ts'
import { addComment, anchor, createThread, quote, type ThreadFixture } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp } from './support/test-app.ts'
import { createStudio, type Studio } from './support/world.ts'

// The notice that a comment changed goes out after the transaction has committed, never inside it: a person who reacts
// to it and asks again must find the change there. To make that observable the database is made to take its time over
// the commit: a deferred trigger runs when the transaction commits and waits. A notice sent from inside the transaction
// is sent during that wait, and what the check below reads then is the state from before the change.

let database: TestDatabase
let db: Kysely<Database>
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
})
afterAll(() => database.drop())

async function makeCommitsSlow(): Promise<void> {
  await sql`create function slow_commit() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.3); return null; end $$`.execute(db)
  for (const table of ['threads', 'comments']) {
    await sql`create constraint trigger ${sql.id(`${table}_slow_commit`)} after insert or update or delete on ${sql.table(table)}
      deferrable initially deferred for each row execute function slow_commit()`.execute(db)
  }
}

async function makeCommitsFast(): Promise<void> {
  for (const table of ['threads', 'comments']) {
    await sql`drop trigger ${sql.id(`${table}_slow_commit`)} on ${sql.table(table)}`.execute(db)
  }
  await sql`drop function slow_commit()`.execute(db)
}

interface Case {
  readonly name: string
  /** A thread in the state the operation starts from; this runs with commits at their normal speed. */
  arrange(): Promise<ThreadFixture & { replyId: string }>
  request(ids: ThreadFixture & { replyId: string }): Omit<Call, 'as'>
  /**
   * What the change leaves in the database, asked from a connection of its own as the notice goes out, with the thread
   * the notice names.
   */
  hasCommitted(ids: ThreadFixture & { replyId: string }, notified: string): Promise<boolean>
}

const thread = async (resolved = false) => {
  const fixture = await createThread(db, {
    workspaceId: studio.workspaceId,
    documentId: studio.documentId,
    author: studio.owner,
    ...(resolved ? { resolvedBy: studio.owner } : {}),
  })
  const replyId = await addComment(db, {
    workspaceId: studio.workspaceId,
    threadId: fixture.threadId,
    author: studio.owner,
    body: 'A reply',
  })
  return { ...fixture, replyId }
}

const exists = async (table: 'threads' | 'comments', id: string): Promise<boolean> =>
  (await db.selectFrom(table).select('id').where('id', '=', id).execute()).length === 1

const cases: readonly Case[] = [
  {
    name: 'starting a thread',
    arrange: thread,
    request: () => ({
      method: 'POST',
      url: `/api/documents/${studio.documentId}/threads`,
      body: { anchor, quote, body: 'Does the workshop fit before then?' },
    }),
    hasCommitted: (_ids, notified) => exists('threads', notified),
  },
  {
    name: 'replying',
    arrange: thread,
    request: ({ threadId }) => ({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      body: { body: 'Yes, on the 4th.' },
    }),
    hasCommitted: async ({ threadId }) =>
      (await db.selectFrom('comments').select('id').where('thread_id', '=', threadId).execute()).length === 3,
  },
  {
    name: 'resolving',
    arrange: thread,
    request: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/resolve` }),
    hasCommitted: async ({ threadId }) =>
      (await db.selectFrom('threads').select('resolved_at').where('id', '=', threadId).executeTakeFirstOrThrow())
        .resolved_at !== null,
  },
  {
    name: 'reopening',
    arrange: () => thread(true),
    request: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/reopen` }),
    hasCommitted: async ({ threadId }) =>
      (await db.selectFrom('threads').select('resolved_at').where('id', '=', threadId).executeTakeFirstOrThrow())
        .resolved_at === null,
  },
  {
    name: 'editing a comment',
    arrange: thread,
    request: ({ replyId }) => ({ method: 'PATCH', url: `/api/comments/${replyId}`, body: { body: 'Edited' } }),
    hasCommitted: async ({ replyId }) =>
      (await db.selectFrom('comments').select('body').where('id', '=', replyId).executeTakeFirstOrThrow()).body ===
      'Edited',
  },
  {
    name: 'deleting a comment',
    arrange: thread,
    request: ({ replyId }) => ({ method: 'DELETE', url: `/api/comments/${replyId}` }),
    hasCommitted: async ({ replyId }) => !(await exists('comments', replyId)),
  },
]

describe('the notice that a comment changed', () => {
  it.each(cases)('comes after the change is committed, for $name', async (change) => {
    const ids = await change.arrange()
    await makeCommitsSlow()
    try {
      const observed: Promise<boolean>[] = []
      const broadcaster: DocumentBroadcaster = {
        broadcast: (_documentId, event) => {
          if (event.type === 'comments-changed') observed.push(change.hasCommitted(ids, event.threadId))
        },
      }
      const server = createTestApp(db, undefined, broadcaster)

      const response = await apiOf(server)({ as: studio.owner, ...change.request(ids) })
      await server.app.close()

      expect(response.statusCode).toBeLessThan(300)
      expect(await Promise.all(observed)).toEqual([true])
    } finally {
      await makeCommitsFast()
    }
  })
})
