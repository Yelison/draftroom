import { documentName } from '@draftroom/contract/collab'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { broadcastToDocument } from '../../src/collab/broadcastToDocument.ts'
import type { Database } from '../../src/db/tables.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import { apiOf, bodyAs, type Api } from '../support/api.ts'
import { anchor, quote } from '../support/comments.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// What the people who have a document open are told when its comments change (protocol §9): with the real collaboration
// server and `HocuspocusProvider` clients, and the REST app wired to the server as the process wires it. The event is
// `comments-changed` with the id of the thread, to every connection of that document and to no other.

type Thread = Schema<'Thread'>

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let clients: ClientSet
let server: TestApp
let api: Api
let workspaceId: string
let owner: Person
let editor: Person
let viewer: Person
let documentId: string
let otherDocumentId: string
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
  clients = new ClientSet(collab.url)
  const toCollaboration: DocumentBroadcaster = {
    broadcast: (id, event) => broadcastToDocument(collab.server.hocuspocus, id, event),
  }
  server = createTestApp(db, undefined, toCollaboration)
  api = apiOf(server)

  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  editor = await createPerson(db, 'Priya Raman')
  viewer = await createPerson(db, 'Tom Weller')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, editor)
  await join(db, workspaceId, viewer)
  documentId = await createDocument(db, { workspaceId, creator: owner })
  otherDocumentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
})
afterEach(() => {
  clients.destroyAll()
})
afterAll(async () => {
  await server.app.close()
  await collab.close()
  await database.drop()
})

const startThread = async (as: Person, id: string): Promise<Thread> => {
  const response = await api({
    as,
    method: 'POST',
    url: `/api/documents/${id}/threads`,
    body: { anchor, quote, body: 'Does the workshop fit before then?' },
  })
  expect(response.statusCode).toBe(201)
  return bodyAs<Thread>(response)
}

describe('a client with the document open', () => {
  it('is told which thread changed after each thing done to it, and after nothing that changed nothing', async () => {
    const client = clients.open(documentId, { email: editor.email })
    await client.waitForSynced()

    const thread = await startThread(owner, documentId)
    const firstComment = thread.comments[0]?.id as string
    const reply = bodyAs<{ id: string }>(
      await api({
        as: owner,
        method: 'POST',
        url: `/api/threads/${thread.id}/replies`,
        body: { body: 'Yes, on the 4th.' },
      }),
    )
    await api({ as: owner, method: 'POST', url: `/api/threads/${thread.id}/resolve` })
    // Already resolved: nothing changes, so nothing is said. Events arrive in order, so one that was sent would be
    // counted before the next.
    await api({ as: owner, method: 'POST', url: `/api/threads/${thread.id}/resolve` })
    await api({ as: owner, method: 'POST', url: `/api/threads/${thread.id}/reopen` })
    await api({ as: owner, method: 'PATCH', url: `/api/comments/${reply.id}`, body: { body: 'Yes, on the 5th.' } })
    await api({ as: owner, method: 'DELETE', url: `/api/comments/${reply.id}` })
    // The last comment takes the thread with it, and the people who have it open still have to drop it.
    await api({ as: owner, method: 'DELETE', url: `/api/comments/${firstComment}` })

    const events = await client.waitForCommentEvents(7)

    expect(events).toEqual(Array.from({ length: 7 }, () => ({ type: 'comments-changed', threadId: thread.id })))
  })

  it('is told even when it can only read: a viewer hears of a comment as an editor does', async () => {
    const reader = clients.open(documentId, { email: viewer.email })
    await reader.waitForSynced()
    expect(await reader.waitForScope()).toBe('readonly')

    const thread = await startThread(owner, documentId)

    expect(await reader.waitForCommentEvents(1)).toEqual([{ type: 'comments-changed', threadId: thread.id }])
  })

  it('is told of a thread it started itself, as everyone else is', async () => {
    const author = clients.open(documentId, { email: editor.email })
    await author.waitForSynced()

    const thread = await startThread(editor, documentId)

    expect(await author.waitForCommentEvents(1)).toEqual([{ type: 'comments-changed', threadId: thread.id }])
  })
})

describe('a client with another document open', () => {
  it('is told about the threads of that document and never about those of this one', async () => {
    // The same person can read both, so what keeps the event out is the document and not what the person may see.
    const here = clients.open(documentId, { email: owner.email })
    const there = clients.open(otherDocumentId, { email: owner.email })
    await Promise.all([here.waitForSynced(), there.waitForSynced()])

    const inThisOne = await startThread(owner, documentId)
    await here.waitForCommentEvents(1)
    // Said in order on each connection: once the other document has been told of its own thread, anything meant for it
    // from the first one would already be there.
    const inTheOther = await startThread(owner, otherDocumentId)
    await there.waitForCommentEvents(1)

    expect(here.commentEvents.map((event) => event.threadId)).toEqual([inThisOne.id])
    expect(there.commentEvents.map((event) => event.threadId)).toEqual([inTheOther.id])
  })
})

describe('a document nobody has open', () => {
  it('is not loaded to be told, and the write goes through', async () => {
    const quietDocumentId = await createDocument(db, { workspaceId, creator: owner })
    const open = collab.server.hocuspocus.documents.size

    const response = await api({
      as: owner,
      method: 'POST',
      url: `/api/documents/${quietDocumentId}/threads`,
      body: { anchor, quote, body: 'Nobody is here' },
    })

    expect(response.statusCode).toBe(201)
    expect(collab.server.hocuspocus.documents.has(documentName(quietDocumentId))).toBe(false)
    expect(collab.server.hocuspocus.documents.size).toBe(open)
  })
})

describe('a broadcast that fails', () => {
  it('does not undo the write, and is logged', async () => {
    let attempts = 0
    const lines: string[] = []
    const failing = createTestApp(
      db,
      undefined,
      {
        broadcast: () => {
          attempts += 1
          throw new Error('the connection went away')
        },
      },
      { level: 'warn', stream: { write: (line: string) => lines.push(line) } },
    )
    try {
      const response = await apiOf(failing)({
        as: owner,
        method: 'POST',
        url: `/api/documents/${documentId}/threads`,
        body: { anchor, quote, body: 'Still written' },
      })

      expect(response.statusCode).toBe(201)
      const stored = await db.selectFrom('threads').select('id').where('id', '=', bodyAs<Thread>(response).id).execute()
      expect({ attempts, stored: stored.length }).toEqual({ attempts: 1, stored: 1 })
      expect(lines.join('')).toContain('comments-changed could not be broadcast')
    } finally {
      await failing.app.close()
    }
  })
})
