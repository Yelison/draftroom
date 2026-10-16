import type { Schema } from '@draftroom/contract'
import { MAX_ANCHOR_POSITION_LENGTH } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, notFound, type Api, type Call } from './support/api.ts'
import { anchor, commentTableCounts, createThread, quote } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// What the comments API does, by the rules of docs/api/README.md. Who may do what is the access matrix's; these tests
// are about what the operations do once they are allowed, and about what a refused one leaves behind.

type Thread = Schema<'Thread'>
type Comment = Schema<'Comment'>

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let workspaceId: string
let people: Record<'workspaceOwner' | 'documentOwner' | 'editor' | 'commenter' | 'viewer' | 'outsider', Person>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  workspaceId = await createWorkspace(db)
  people = {
    workspaceOwner: await createPerson(db, 'Marta Ruiz'),
    documentOwner: await createPerson(db, 'Sam Okoye'),
    editor: await createPerson(db, 'Priya Raman'),
    commenter: await createPerson(db, 'Daniel Okafor'),
    viewer: await createPerson(db, 'Tom Weller'),
    outsider: await createPerson(db, 'Lucía Fernández'),
  }
  await join(db, workspaceId, people.workspaceOwner, 'owner')
  for (const person of [people.documentOwner, people.editor, people.commenter, people.viewer]) {
    await join(db, workspaceId, person)
  }
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

/** A document of the workspace that everyone but the outsider holds a role on, and nothing in it yet. */
async function freshDocument(): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: people.documentOwner })
  await grant(db, { workspaceId, documentId, person: people.editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: people.commenter, role: 'commenter' })
  await grant(db, { workspaceId, documentId, person: people.viewer, role: 'viewer' })
  return documentId
}

async function startThread(
  as: Person,
  documentId: string,
  body = 'Does the workshop fit before then?',
): Promise<Thread> {
  const response = await api({
    as,
    method: 'POST',
    url: `/api/documents/${documentId}/threads`,
    body: { anchor, quote, body },
  })
  expect(response.statusCode).toBe(201)
  return bodyAs<Thread>(response)
}

async function reply(as: Person, threadId: string, body = 'Yes, it runs on the 4th.'): Promise<Comment> {
  const response = await api({ as, method: 'POST', url: `/api/threads/${threadId}/replies`, body: { body } })
  expect(response.statusCode).toBe(201)
  return bodyAs<Comment>(response)
}

const threadsOf = async (as: Person, documentId: string, query = ''): Promise<Thread[]> =>
  bodyAs<{ items: Thread[] }>(await api({ as, method: 'GET', url: `/api/documents/${documentId}/threads${query}` }))
    .items

const eventsOf = (documentId: string) =>
  db
    .selectFrom('activity_events')
    .select(['type', 'actor_id', 'target_user_id'])
    .where('document_id', '=', documentId)
    .orderBy('created_at')
    .execute()

interface Ids {
  readonly documentId: string
  readonly threadId: string
  readonly commentId: string
}

/** One valid request for each operation, as a person with the right role would send it. */
const requests: Readonly<Record<string, (ids: Ids) => Omit<Call, 'as'>>> = {
  listThreads: ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/threads` }),
  createThread: ({ documentId }) => ({
    method: 'POST',
    url: `/api/documents/${documentId}/threads`,
    body: { anchor, quote, body: 'A comment' },
  }),
  replyToThread: ({ threadId }) => ({
    method: 'POST',
    url: `/api/threads/${threadId}/replies`,
    body: { body: 'A comment' },
  }),
  resolveThread: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/resolve` }),
  reopenThread: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/reopen` }),
  updateComment: ({ commentId }) => ({ method: 'PATCH', url: `/api/comments/${commentId}`, body: { body: 'Edited' } }),
  deleteComment: ({ commentId }) => ({ method: 'DELETE', url: `/api/comments/${commentId}` }),
}

/** A thread of the document with one comment, written by the person, and the request of an operation against it. */
async function requestFor(operationId: string, documentId: string, author: Person): Promise<Omit<Call, 'as'>> {
  const { threadId, commentId } = await createThread(db, { workspaceId, documentId, author })
  const request = requests[operationId]
  if (request === undefined) throw new Error(`No request for ${operationId}`)
  return request({ documentId, threadId, commentId })
}

describe('starting a thread', () => {
  it('answers the thread with its first comment, written by the person who asked', async () => {
    const documentId = await freshDocument()

    const response = await api({
      as: people.commenter,
      method: 'POST',
      url: `/api/documents/${documentId}/threads`,
      body: { anchor, quote, body: 'Does the workshop fit before then?' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.body).toMatchObject({
      documentId,
      status: 'open',
      anchor,
      quote,
      createdBy: { id: people.commenter.id, name: 'Daniel Okafor' },
      resolvedAt: null,
      resolvedBy: null,
      comments: [{ author: { id: people.commenter.id }, body: 'Does the workshop fit before then?' }],
    })
  })

  it('keeps the anchor exactly as it was sent and never reads it', async () => {
    const documentId = await freshDocument()
    // Valid base64 that is not a relative position of anything: the server has no opinion on what it encodes.
    const opaque = { start: 'AAAA', end: 'Zm9vYmFy' }

    const created = await api({
      as: people.editor,
      method: 'POST',
      url: `/api/documents/${documentId}/threads`,
      body: { anchor: opaque, quote, body: 'A note' },
    })

    expect(created.statusCode).toBe(201)
    expect((await threadsOf(people.viewer, documentId))[0]?.anchor).toEqual(opaque)
  })

  it('is read back by anyone who can read the document, a viewer included', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    expect((await threadsOf(people.viewer, documentId)).map((thread) => thread.id)).toEqual([started.id])
  })
})

describe('the threads of a document', () => {
  it('come oldest first, each with its comments oldest first, and only those of that document', async () => {
    const documentId = await freshDocument()
    const other = await freshDocument()
    const first = await startThread(people.commenter, documentId, 'First')
    const second = await startThread(people.editor, documentId, 'Second')
    await startThread(people.editor, other, 'Of another document')
    const early = await reply(people.documentOwner, first.id, 'Reply one')
    const late = await reply(people.editor, first.id, 'Reply two')

    const threads = await threadsOf(people.viewer, documentId)

    expect(threads.map((thread) => thread.id)).toEqual([first.id, second.id])
    expect(threads[0]?.comments.map((comment) => comment.id)).toEqual([first.comments[0]?.id, early.id, late.id])
  })

  it('can be asked for open ones or resolved ones, and are both when the filter is left out', async () => {
    const documentId = await freshDocument()
    const open = await startThread(people.commenter, documentId)
    const resolved = await startThread(people.commenter, documentId)
    await api({ as: people.editor, method: 'POST', url: `/api/threads/${resolved.id}/resolve` })

    const ids = async (query: string) => (await threadsOf(people.viewer, documentId, query)).map((thread) => thread.id)

    expect(await ids('?status=open')).toEqual([open.id])
    expect(await ids('?status=resolved')).toEqual([resolved.id])
    expect(await ids('')).toEqual([open.id, resolved.id])
  })
})

describe('replying to a thread', () => {
  it('adds a comment by the person to the end of the thread and leaves the thread as it is', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    const added = await reply(people.editor, started.id, 'Yes, it runs on the 4th.')

    expect(added).toMatchObject({
      threadId: started.id,
      author: { id: people.editor.id, name: 'Priya Raman' },
      body: 'Yes, it runs on the 4th.',
    })
    const [thread] = await threadsOf(people.viewer, documentId)
    expect({ status: thread?.status, comments: thread?.comments.length, createdBy: thread?.createdBy.id }).toEqual({
      status: 'open',
      comments: 2,
      createdBy: people.commenter.id,
    })
  })

  it('is still possible on a resolved thread, which stays resolved', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    await api({ as: people.editor, method: 'POST', url: `/api/threads/${started.id}/resolve` })

    await reply(people.commenter, started.id, 'One more thing')

    const [thread] = await threadsOf(people.viewer, documentId)
    expect({ status: thread?.status, comments: thread?.comments.length }).toEqual({ status: 'resolved', comments: 2 })
  })
})

describe('resolving and reopening a thread', () => {
  const call = (as: Person, threadId: string, action: 'resolve' | 'reopen') =>
    api({ as, method: 'POST', url: `/api/threads/${threadId}/${action}` })

  it('resolves it by the person and at the time, and reopens it with neither', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    const resolved = bodyAs<Thread>(await call(people.editor, started.id, 'resolve'))
    const reopened = bodyAs<Thread>(await call(people.commenter, started.id, 'reopen'))

    expect(resolved).toMatchObject({ status: 'resolved', resolvedBy: { id: people.editor.id } })
    expect(resolved.resolvedAt).not.toBeNull()
    expect(reopened).toMatchObject({ status: 'open', resolvedAt: null, resolvedBy: null })
  })

  it('resolves a thread that is already resolved without changing who resolved it or when', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const first = bodyAs<Thread>(await call(people.editor, started.id, 'resolve'))

    const again = await call(people.documentOwner, started.id, 'resolve')

    expect(again.statusCode).toBe(200)
    expect(again.body).toEqual(first)
  })

  it('reopens a thread that is already open and changes nothing', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    const again = await call(people.editor, started.id, 'reopen')

    expect(again.statusCode).toBe(200)
    expect(again.body).toEqual(started)
  })

  it('still refuses a viewer on a thread that is already in the state they ask for', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    await call(people.editor, started.id, 'resolve')

    // The role comes before the state of the thread: an answer that succeeds would tell a viewer how the thread stands.
    expect((await call(people.viewer, started.id, 'resolve')).statusCode).toBe(403)
    expect((await call(people.viewer, started.id, 'reopen')).statusCode).toBe(403)
  })
})

describe('editing a comment', () => {
  const edit = (as: Person, commentId: string, body: string) =>
    api({ as, method: 'PATCH', url: `/api/comments/${commentId}`, body: { body } })

  it('changes the text and the time it was changed, and not who wrote it or when', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const original = started.comments[0] as Comment

    const response = await edit(people.commenter, original.id, 'Does the workshop fit before the 4th?')

    expect(response.statusCode).toBe(200)
    const edited = bodyAs<Comment>(response)
    expect(edited).toMatchObject({
      id: original.id,
      author: original.author,
      createdAt: original.createdAt,
      body: 'Does the workshop fit before the 4th?',
    })
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt))
  })

  it('is not an edit when the text is the same, so the comment is not shown as changed', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const original = started.comments[0] as Comment

    const response = await edit(people.commenter, original.id, original.body)

    expect(response.body).toEqual(original)
  })

  it.each([
    ['an owner of the document', () => people.documentOwner],
    ['an owner of the workspace', () => people.workspaceOwner],
    ['an editor', () => people.editor],
  ])('is refused to %s who did not write it: only the author edits', async (_who, person) => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const original = started.comments[0] as Comment

    const response = await edit(person(), original.id, 'Rewritten by somebody else')

    expect(response.statusCode).toBe(403)
    expect((await threadsOf(people.viewer, documentId))[0]?.comments[0]?.body).toBe(original.body)
  })

  it('is refused to an author who has been made a viewer since', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    await db
      .updateTable('document_access')
      .set({ role: 'viewer' })
      .where('document_id', '=', documentId)
      .where('user_id', '=', people.commenter.id)
      .execute()

    const response = await edit(people.commenter, started.comments[0]?.id as string, 'Too late')

    expect(response.statusCode).toBe(403)
  })
})

describe('deleting a comment', () => {
  const remove = (as: Person, commentId: string) => api({ as, method: 'DELETE', url: `/api/comments/${commentId}` })

  it('lets the author delete their own and keeps the rest of the thread', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const answer = await reply(people.editor, started.id)

    const response = await remove(people.editor, answer.id)

    expect(response.statusCode).toBe(204)
    const [thread] = await threadsOf(people.viewer, documentId)
    expect(thread?.comments.map((comment) => comment.id)).toEqual([started.comments[0]?.id])
  })

  it.each([
    ['an owner of the document', () => people.documentOwner],
    ['an owner of the workspace', () => people.workspaceOwner],
  ])('lets %s delete the comment of somebody else', async (_who, person) => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const answer = await reply(people.editor, started.id)

    expect((await remove(person(), answer.id)).statusCode).toBe(204)
  })

  it.each([
    ['an editor', () => people.editor],
    ['a commenter', () => people.commenter],
  ])('is refused to %s who did not write the comment: only an owner deletes another person’s', async (_who, person) => {
    const documentId = await freshDocument()
    const started = await startThread(people.documentOwner, documentId)

    const response = await remove(person(), started.comments[0]?.id as string)

    expect(response.statusCode).toBe(403)
    expect(await threadsOf(people.viewer, documentId)).toHaveLength(1)
  })

  it('keeps the thread, and who started it, when the comment that started it is deleted but replies remain', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const answer = await reply(people.editor, started.id)

    await remove(people.commenter, started.comments[0]?.id as string)

    const [thread] = await threadsOf(people.viewer, documentId)
    expect(thread).toMatchObject({
      id: started.id,
      createdBy: { id: people.commenter.id },
      comments: [{ id: answer.id }],
    })
  })

  it('takes the thread with it when the last comment goes, and the thread is not there any more', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    await remove(people.commenter, started.comments[0]?.id as string)

    expect(await threadsOf(people.viewer, documentId)).toEqual([])
    const gone = await api({ as: people.editor, method: 'POST', url: `/api/threads/${started.id}/resolve` })
    expect(gone).toMatchObject({ statusCode: 404, body: notFound })
  })

  it('answers 404 for a comment that is already gone', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const commentId = started.comments[0]?.id as string
    await remove(people.commenter, commentId)

    expect(await remove(people.commenter, commentId)).toMatchObject({ statusCode: 404, body: notFound })
  })
})

// Limits count Unicode code points, like the contract: an emoji is one, though JavaScript counts two units for it.
describe('the limits of a text', () => {
  const emoji = '😀'

  it.each([
    ['a comment that starts a thread', 'body', 5000, 5001],
    ['the quote of a thread', 'quote', 500, 501],
  ])('allows %s up to the limit in emoji and refuses one more with 413', async (_what, field, limit, over) => {
    const documentId = await freshDocument()
    const start = (length: number) =>
      api({
        as: people.commenter,
        method: 'POST',
        url: `/api/documents/${documentId}/threads`,
        body: { anchor, quote: 'a quote', body: 'A comment', [field]: emoji.repeat(length) },
      })

    expect((await start(limit)).statusCode).toBe(201)
    const refused = await start(over)
    expect(refused).toMatchObject({
      statusCode: 413,
      body: { code: 'too-large', errors: [{ pointer: `/${field}`, code: 'too-long' }] },
    })
  })

  it.each(['reply', 'edit'] as const)(
    'allows a comment to %s up to 5000 emoji and refuses one more with 413',
    async (action) => {
      const documentId = await freshDocument()
      const started = await startThread(people.commenter, documentId)
      const write = (length: number) =>
        action === 'reply'
          ? api({
              as: people.commenter,
              method: 'POST',
              url: `/api/threads/${started.id}/replies`,
              body: { body: emoji.repeat(length) },
            })
          : api({
              as: people.commenter,
              method: 'PATCH',
              url: `/api/comments/${started.comments[0]?.id}`,
              body: { body: emoji.repeat(length) },
            })

      expect([(await write(5000)).statusCode, (await write(5001)).statusCode]).toEqual([
        action === 'reply' ? 201 : 200,
        413,
      ])
    },
  )

  it('allows an end of the anchor up to the limit of the protocol, and refuses one character more with 413', async () => {
    const documentId = await freshDocument()
    const start = (end: string) =>
      api({
        as: people.commenter,
        method: 'POST',
        url: `/api/documents/${documentId}/threads`,
        body: { anchor: { start: anchor.start, end }, quote, body: 'A comment' },
      })

    expect((await start('A'.repeat(MAX_ANCHOR_POSITION_LENGTH))).statusCode).toBe(201)
    expect(await start('A'.repeat(MAX_ANCHOR_POSITION_LENGTH + 1))).toMatchObject({
      statusCode: 413,
      body: { code: 'too-large', errors: [{ pointer: '/anchor/end', code: 'too-long' }] },
    })
  })

  it('refuses an empty comment with 400, which is a rule broken and not a text too long', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    const response = await api({
      as: people.commenter,
      method: 'POST',
      url: `/api/threads/${started.id}/replies`,
      body: { body: '' },
    })

    expect(response).toMatchObject({
      statusCode: 400,
      body: { code: 'validation-failed', errors: [{ pointer: '/body', code: 'too-short' }] },
    })
  })
})

describe('the history of a document', () => {
  it('holds one event for each thing done to a thread, by the person who did it', async () => {
    const documentId = await freshDocument()

    const started = await startThread(people.commenter, documentId)
    await reply(people.editor, started.id)
    await api({ as: people.documentOwner, method: 'POST', url: `/api/threads/${started.id}/resolve` })
    await api({ as: people.commenter, method: 'POST', url: `/api/threads/${started.id}/reopen` })

    expect(await eventsOf(documentId)).toEqual([
      { type: 'thread.created', actor_id: people.commenter.id, target_user_id: null },
      { type: 'thread.replied', actor_id: people.editor.id, target_user_id: null },
      { type: 'thread.resolved', actor_id: people.documentOwner.id, target_user_id: null },
      { type: 'thread.reopened', actor_id: people.commenter.id, target_user_id: null },
    ])
  })

  it('does not repeat an event for resolving or reopening a thread that is already there', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)

    await api({ as: people.editor, method: 'POST', url: `/api/threads/${started.id}/reopen` })
    await api({ as: people.editor, method: 'POST', url: `/api/threads/${started.id}/resolve` })
    await api({ as: people.editor, method: 'POST', url: `/api/threads/${started.id}/resolve` })

    expect((await eventsOf(documentId)).map((event) => event.type)).toEqual(['thread.created', 'thread.resolved'])
  })

  it('has no event for editing or deleting a comment, which the contract has no kind of event for', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    const answer = await reply(people.editor, started.id)

    await api({ as: people.editor, method: 'PATCH', url: `/api/comments/${answer.id}`, body: { body: 'Edited' } })
    await api({ as: people.editor, method: 'DELETE', url: `/api/comments/${answer.id}` })

    expect((await eventsOf(documentId)).map((event) => event.type)).toEqual(['thread.created', 'thread.replied'])
  })
})

describe('a viewer, who reads and does not comment', () => {
  const changes = Object.keys(requests).filter((operationId) => operationId !== 'listThreads')

  it.each(changes)(
    'cannot %s, with a request made by hand as well as through the screen, and nothing is written',
    async (operationId) => {
      const documentId = await freshDocument()
      const request = await requestFor(operationId, documentId, people.commenter)
      const before = await commentTableCounts(db)

      const response = await api({ as: people.viewer, ...request })

      expect(response.statusCode).toBe(403)
      expect(await commentTableCounts(db)).toEqual(before)
    },
  )

  it('gets nothing written either by a request that names somebody else as the author', async () => {
    const documentId = await freshDocument()
    const before = await commentTableCounts(db)

    const response = await api({
      as: people.viewer,
      method: 'POST',
      url: `/api/documents/${documentId}/threads`,
      body: { anchor, quote, body: 'A comment', authorId: people.documentOwner.id, role: 'owner' },
    })

    expect(response.statusCode).toBe(400)
    expect(await commentTableCounts(db)).toEqual(before)
  })

  it('still reads: a viewer sees the threads and their comments', async () => {
    const documentId = await freshDocument()
    await createThread(db, { workspaceId, documentId, author: people.commenter, body: 'Worth a look' })

    expect((await threadsOf(people.viewer, documentId))[0]?.comments[0]?.body).toBe('Worth a look')
  })
})

describe('the order of the checks', () => {
  it('answers 401 to a request with no session', async () => {
    const documentId = await freshDocument()

    const response = await api({ method: 'GET', url: `/api/documents/${documentId}/threads` })

    expect(response.statusCode).toBe(401)
  })

  it('checks the shape of a request before the role: a viewer with a broken body gets 400, not 403', async () => {
    const documentId = await freshDocument()
    const { threadId } = await createThread(db, { workspaceId, documentId, author: people.commenter })

    const response = await api({
      as: people.viewer,
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      body: { body: '' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('checks the shape before the thread exists: a broken body is the same 400 for a thread that is not there', async () => {
    const documentId = await freshDocument()
    const { threadId } = await createThread(db, { workspaceId, documentId, author: people.commenter })
    const broken = (id: string) =>
      api({ as: people.commenter, method: 'POST', url: `/api/threads/${id}/replies`, body: { body: '' } })

    const real = await broken(threadId)
    const missing = await broken('0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01')

    expect(missing).toMatchObject({ statusCode: 400, body: real.body })
  })

  it('checks that the document can be read before the role: a person with no role gets 404, not 403', async () => {
    const documentId = await freshDocument()
    const { threadId } = await createThread(db, { workspaceId, documentId, author: people.commenter })

    const response = await api({ as: people.outsider, method: 'POST', url: `/api/threads/${threadId}/resolve` })

    expect(response).toMatchObject({ statusCode: 404, body: notFound })
  })
})

describe('the threads of an archived document', () => {
  const archive = async (documentId: string, archived: boolean) => {
    await db
      .updateTable('documents')
      .set({ archived_at: archived ? new Date() : null })
      .where('id', '=', documentId)
      .execute()
  }

  it.each(Object.keys(requests))('are as hidden as the document for %s, even from its owners', async (operationId) => {
    const documentId = await freshDocument()
    const request = await requestFor(operationId, documentId, people.documentOwner)
    await archive(documentId, true)

    for (const as of [people.workspaceOwner, people.documentOwner, people.editor, people.viewer]) {
      expect(await api({ as, ...request })).toMatchObject({ statusCode: 404, body: notFound })
    }
  })

  it('leave their comments where they are, which are there when the document comes back', async () => {
    const documentId = await freshDocument()
    const started = await startThread(people.commenter, documentId)
    await archive(documentId, true)

    const refused = await api({
      as: people.commenter,
      method: 'DELETE',
      url: `/api/comments/${started.comments[0]?.id}`,
    })
    await archive(documentId, false)

    expect(refused.statusCode).toBe(404)
    expect((await threadsOf(people.viewer, documentId)).map((thread) => thread.id)).toEqual([started.id])
  })
})
