import type { Kysely, Transaction } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteComment, insertReply, setResolved, updateCommentBody } from '../src/db/comments/commands.ts'
import type { Database } from '../src/db/tables.ts'
import { apiOf, notFound, type Api } from './support/api.ts'
import { addComment, createThread } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createStudio, type Studio } from './support/world.ts'

// Two people acting on one thread at the same moment. Each case holds one transaction open on purpose, the way a slow
// request would be in flight, and checks what the other does meanwhile: it has to wait for the thread, and what it
// finds when it goes on is what the first committed. The pause is only the time to let the second reach the wait; a
// server that does not wait finishes in a few milliseconds, long before it, and fails the assertion that it is waiting.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  studio = await createStudio(db)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
const timeToReachTheWait = 250

interface OpenTransaction {
  /** Commits what the transaction did. */
  commit(): void
  /** Settles when the transaction has committed. */
  readonly finished: Promise<unknown>
}

/** Runs `work` in a transaction and leaves it open, with its locks, until `commit()` is called. */
async function holdOpen(work: (trx: Transaction<Database>) => Promise<unknown>): Promise<OpenTransaction> {
  let commit = (): void => undefined
  const released = new Promise<void>((resolve) => (commit = resolve))
  let worked = (): void => undefined
  const hasWorked = new Promise<void>((resolve) => (worked = resolve))
  const finished = db.transaction().execute(async (trx) => {
    await work(trx)
    worked()
    await released
  })
  // If the work fails, `finished` rejects and the test with it, instead of waiting for a signal that will not come.
  await Promise.race([hasWorked, finished])
  return { commit: () => commit(), finished }
}

/** Starts something and reports whether it is still waiting after the others had time to finish. */
async function startAndWatch<T>(start: () => Promise<T>): Promise<{ result: Promise<T>; waiting: () => boolean }> {
  let settled = false
  const result = start().finally(() => {
    settled = true
  })
  result.catch(() => undefined)
  await pause(timeToReachTheWait)
  return { result, waiting: () => !settled }
}

describe('two people deleting the last two comments of a thread at once', () => {
  it('leave no thread behind: the second waits for the first and counts what it left', async () => {
    const { threadId, commentId: first } = await createThread(db, {
      workspaceId: studio.workspaceId,
      documentId: studio.documentId,
      author: studio.owner,
    })
    const second = await addComment(db, {
      workspaceId: studio.workspaceId,
      threadId,
      author: studio.owner,
      body: 'A reply',
    })
    const firstDeletion = await holdOpen((trx) => deleteComment(trx, first))

    const secondDeletion = await startAndWatch(() => db.transaction().execute((trx) => deleteComment(trx, second)))
    const waited = secondDeletion.waiting()
    firstDeletion.commit()
    await Promise.all([firstDeletion.finished, secondDeletion.result])

    expect(waited).toBe(true)
    expect(await db.selectFrom('threads').select('id').where('id', '=', threadId).execute()).toEqual([])
  })
})

describe('something done to a thread while its last comment is being deleted', () => {
  type Outcome = string | undefined

  const cases: readonly (readonly [
    string,
    (ids: { threadId: string; commentId: string }) => (trx: Transaction<Database>) => Promise<Outcome>,
    Outcome,
  ])[] = [
    [
      'a reply',
      ({ threadId }) =>
        (trx) =>
          insertReply(trx, { threadId, body: 'Too late', authorId: studio.owner.id }),
      undefined,
    ],
    [
      'resolving it',
      ({ threadId }) =>
        (trx) =>
          setResolved(trx, { threadId, actorId: studio.owner.id, resolve: true }),
      'missing',
    ],
    [
      'reopening it',
      ({ threadId }) =>
        (trx) =>
          setResolved(trx, { threadId, actorId: studio.owner.id, resolve: false }),
      'missing',
    ],
    [
      'editing that comment',
      ({ commentId }) =>
        (trx) =>
          updateCommentBody(trx, { commentId, body: 'Too late' }),
      'missing',
    ],
    [
      'deleting that comment again',
      ({ commentId }) =>
        (trx) =>
          deleteComment(trx, commentId),
      'missing',
    ],
  ]

  it.each(cases)('finds the thread gone once it goes on, for %s', async (_what, operation, expected) => {
    const { threadId, commentId } = await createThread(db, {
      workspaceId: studio.workspaceId,
      documentId: studio.documentId,
      author: studio.owner,
    })
    const deletion = await holdOpen((trx) => deleteComment(trx, commentId))

    const other = await startAndWatch(() => db.transaction().execute(operation({ threadId, commentId })))
    const waited = other.waiting()
    deletion.commit()
    const outcome = await other.result
    await deletion.finished

    expect({ waited, outcome }).toEqual({ waited: true, outcome: expected })
  })
})

describe('the same, asked through the API', () => {
  const requests: readonly (readonly [string, (ids: { threadId: string; commentId: string }) => Parameters<Api>[0]])[] =
    [
      [
        'replyToThread',
        ({ threadId }) => ({
          as: studio.owner,
          method: 'POST',
          url: `/api/threads/${threadId}/replies`,
          body: { body: 'Too late' },
        }),
      ],
      [
        'resolveThread',
        ({ threadId }) => ({ as: studio.owner, method: 'POST', url: `/api/threads/${threadId}/resolve` }),
      ],
      [
        'reopenThread',
        ({ threadId }) => ({ as: studio.owner, method: 'POST', url: `/api/threads/${threadId}/reopen` }),
      ],
      [
        'updateComment',
        ({ commentId }) => ({
          as: studio.owner,
          method: 'PATCH',
          url: `/api/comments/${commentId}`,
          body: { body: 'Too late' },
        }),
      ],
      ['deleteComment', ({ commentId }) => ({ as: studio.owner, method: 'DELETE', url: `/api/comments/${commentId}` })],
    ]

  it.each(requests)(
    'answers %s with the 404 of a thread that was never there, and not with a failure of the server',
    async (_operationId, request) => {
      const { threadId, commentId } = await createThread(db, {
        workspaceId: studio.workspaceId,
        documentId: studio.documentId,
        author: studio.owner,
      })
      const deletion = await holdOpen((trx) => deleteComment(trx, commentId))

      const asked = await startAndWatch(() => api(request({ threadId, commentId })))
      deletion.commit()
      const response = await asked.result
      await deletion.finished

      expect(response).toMatchObject({ statusCode: 404, body: notFound })
    },
  )
})
