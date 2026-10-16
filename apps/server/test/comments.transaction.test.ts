import type { Kysely, Transaction } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insertReply, insertThread, setResolved } from '../src/db/comments/commands.ts'
import type { Database } from '../src/db/tables.ts'
import { anchor, commentTableCounts, createThread, quote } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createStudio, type Studio } from './support/world.ts'

// A change to a thread and the event that says so are one write: when the transaction around them is undone, neither is
// left. Each command is run in a transaction that fails after it, and what is left in the tables is what was there before.

let database: TestDatabase
let db: Kysely<Database>
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
})
afterAll(() => database.drop())

const tableSnapshot = async () => ({
  ...(await commentTableCounts(db)),
  resolved: (await db.selectFrom('threads').select('id').where('resolved_at', 'is not', null).execute()).length,
})

describe('a command that is undone with its transaction', () => {
  const cases: readonly (readonly [
    string,
    boolean,
    (trx: Transaction<Database>, threadId: string) => Promise<unknown>,
  ])[] = [
    [
      'starting a thread',
      false,
      (trx) =>
        insertThread(trx, {
          workspaceId: studio.workspaceId,
          documentId: studio.documentId,
          anchor,
          quote,
          body: 'A comment',
          authorId: studio.owner.id,
        }),
    ],
    ['replying', false, (trx, threadId) => insertReply(trx, { threadId, body: 'A reply', authorId: studio.owner.id })],
    ['resolving', false, (trx, threadId) => setResolved(trx, { threadId, actorId: studio.owner.id, resolve: true })],
    ['reopening', true, (trx, threadId) => setResolved(trx, { threadId, actorId: studio.owner.id, resolve: false })],
  ]

  it.each(cases)('leaves no change and no event behind: %s', async (_what, startsResolved, command) => {
    const { threadId } = await createThread(db, {
      workspaceId: studio.workspaceId,
      documentId: studio.documentId,
      author: studio.owner,
      ...(startsResolved ? { resolvedBy: studio.owner } : {}),
    })
    const before = await tableSnapshot()

    await expect(
      db.transaction().execute(async (trx) => {
        await command(trx, threadId)
        throw new Error('the transaction fails after the command')
      }),
    ).rejects.toThrow('after the command')

    expect(await tableSnapshot()).toEqual(before)
  })
})
