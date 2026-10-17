import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { addComment, createThread } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { instantsAgainstIds, setInstants } from './support/stamps.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// The API writes an instant with milliseconds, and the contract orders a list by that instant and then by `id`. Rows that
// share a millisecond are told apart by `id` alone, whatever their microseconds in the database. Each list below holds
// rows whose microseconds are in the opposite order to their ids, so that ordering by the column would show.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let workspaceId: string
let owner: Person
let reader: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  reader = await createPerson(db, 'Carol Nwosu')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, reader)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const byIdDescending = (ids: readonly string[]) => [...ids].sort().reverse()
const byIdAscending = (ids: readonly string[]) => [...ids].sort()

/** Documents the reader can read and does not own, all in one millisecond, against the order of their ids. */
async function documentsOfOneMillisecond(count: number, millisecond: number): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    ids.push(await createDocument(db, { workspaceId, creator: owner, generalAccess: 'viewer' }))
  }
  await setInstants(db, 'documents', 'updated_at', instantsAgainstIds(ids, millisecond))
  return ids
}

describe('the lists of documents, where several share a millisecond', () => {
  it('orders the pinned documents by the millisecond and then by id, whatever the microseconds', async () => {
    const ids = await documentsOfOneMillisecond(4, 1)
    for (const documentId of ids) await api({ as: reader, method: 'PUT', url: `/api/documents/${documentId}/pin` })

    const response = await api({ as: reader, method: 'GET', url: `/api/workspaces/${workspaceId}/pinned` })

    const pinned = bodyAs<Schema<'DocumentList'>>(response).items.map((item) => item.id)
    expect(pinned.filter((id) => ids.includes(id))).toEqual(byIdDescending(ids))
  })

  it('orders the shared documents by the millisecond and then by id, whatever the microseconds', async () => {
    const ids = await documentsOfOneMillisecond(4, 2)

    const response = await api({ as: reader, method: 'GET', url: `/api/workspaces/${workspaceId}/shared` })

    const shared = bodyAs<Schema<'DocumentList'>>(response).items.map((item) => item.id)
    expect(shared.filter((id) => ids.includes(id))).toEqual(byIdDescending(ids))
  })
})

describe('the threads of a document and the comments of a thread, where several share a millisecond', () => {
  let documentId: string
  beforeAll(async () => {
    documentId = await createDocument(db, { workspaceId, creator: owner })
    await grant(db, { workspaceId, documentId, person: reader, role: 'commenter' })
  })
  const threadsOf = async () =>
    bodyAs<{ items: Schema<'Thread'>[] }>(
      await api({ as: reader, method: 'GET', url: `/api/documents/${documentId}/threads` }),
    ).items

  it('orders the threads by the millisecond and then by id, oldest first, whatever the microseconds', async () => {
    const threadIds: string[] = []
    for (let index = 0; index < 4; index += 1) {
      threadIds.push((await createThread(db, { workspaceId, documentId, author: owner })).threadId)
    }
    await setInstants(db, 'threads', 'created_at', instantsAgainstIds(threadIds, 3))

    expect((await threadsOf()).map((thread) => thread.id)).toEqual(byIdAscending(threadIds))
  })

  it('orders the comments of a thread the same way', async () => {
    const { threadId, commentId } = await createThread(db, { workspaceId, documentId, author: owner })
    const commentIds = [commentId]
    for (let index = 0; index < 3; index += 1) {
      commentIds.push(await addComment(db, { workspaceId, threadId, author: owner, body: `Reply ${index}` }))
    }
    await setInstants(db, 'comments', 'created_at', instantsAgainstIds(commentIds, 4))

    const thread = (await threadsOf()).find((candidate) => candidate.id === threadId)

    expect(thread?.comments.map((comment) => comment.id)).toEqual(byIdAscending(commentIds))
  })
})
