import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, notFound, type Api, type Call } from './support/api.ts'
import { anchor, createThread, quote } from './support/comments.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createVersion } from './support/versions.ts'
import { createDocument, createFolder, createPerson, createWorkspace, join, type Person } from './support/world.ts'

// The id of something in another workspace must answer exactly like an id that does not exist: the status, the body,
// the headers that matter. Anything else lets a person find out which ids are real.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

interface Setting {
  readonly alice: Person
  /** Owns a workspace of her own and belongs to neither of the others. */
  readonly zoe: Person
  readonly workspaceId: string
  /** What belongs to the other workspace, where Alice is nobody. */
  readonly foreign: Ids
  /** A document of Alice's own workspace that she cannot read: private to Bruno, with a thread of his in it. */
  readonly hidden: { documentId: string; threadId: string; commentId: string; versionId: string }
}

let setting: Setting
beforeAll(async () => {
  const alice = await createPerson(db, 'Alice Moreau')
  const bruno = await createPerson(db, 'Bruno Silva')
  const zoe = await createPerson(db, 'Zoe Hartmann')
  await join(db, await createWorkspace(db, 'Hartmann Studio'), zoe, 'owner')
  const workspaceId = await createWorkspace(db, 'Harbor & Pine')
  await join(db, workspaceId, alice)
  await join(db, workspaceId, bruno)
  const otherId = await createWorkspace(db, 'Almazara')
  await join(db, otherId, bruno, 'owner')
  // Open to everyone in its workspace: if the boundary between workspaces is lost, a person who belongs to another one
  // would read and edit it, where a private document would still look not-found.
  const foreignDocumentId = await createDocument(db, { workspaceId: otherId, creator: bruno, generalAccess: 'editor' })
  const hiddenDocumentId = await createDocument(db, { workspaceId, creator: bruno })
  setting = {
    alice,
    zoe,
    workspaceId,
    foreign: {
      workspaceId: otherId,
      documentId: foreignDocumentId,
      folderId: await createFolder(db, otherId),
      ...(await createThread(db, { workspaceId: otherId, documentId: foreignDocumentId, author: bruno })),
      versionId: await createVersion(db, { workspaceId: otherId, documentId: foreignDocumentId, author: bruno }),
      userId: bruno.id,
    },
    hidden: {
      documentId: hiddenDocumentId,
      ...(await createThread(db, { workspaceId, documentId: hiddenDocumentId, author: bruno })),
      versionId: await createVersion(db, { workspaceId, documentId: hiddenDocumentId, author: bruno }),
    },
  }
})

interface Ids {
  readonly workspaceId: string
  readonly documentId: string
  readonly folderId: string
  readonly threadId: string
  readonly commentId: string
  readonly versionId: string
  /** A person the calls name: who belongs to the workspace they are about, or nobody. */
  readonly userId: string
}

const routes: readonly (readonly [string, (ids: Ids) => Omit<Call, 'as'>])[] = [
  ['getWorkspace', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}` })],
  ['listFolders', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/folders` })],
  [
    'createFolder',
    ({ workspaceId }) => ({ method: 'POST', url: `/api/workspaces/${workspaceId}/folders`, body: { name: 'Budget' } }),
  ],
  [
    'updateFolder',
    ({ folderId }) => ({ method: 'PATCH', url: `/api/folders/${folderId}`, body: { name: 'Budget', revision: 1 } }),
  ],
  ['deleteFolder', ({ folderId }) => ({ method: 'DELETE', url: `/api/folders/${folderId}` })],
  ['listDocuments', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/documents` })],
  [
    'createDocument',
    ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      body: { title: 'Budget' },
    }),
  ],
  ['listPinnedDocuments', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/pinned` })],
  ['listSharedDocuments', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/shared` })],
  ['getDocument', ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}` })],
  [
    'updateDocument',
    ({ documentId }) => ({
      method: 'PATCH',
      url: `/api/documents/${documentId}`,
      body: { title: 'Budget', revision: 1 },
    }),
  ],
  ['archiveDocument', ({ documentId }) => ({ method: 'POST', url: `/api/documents/${documentId}/archive` })],
  ['restoreDocument', ({ documentId }) => ({ method: 'POST', url: `/api/documents/${documentId}/restore` })],
  ['deleteDocument', ({ documentId }) => ({ method: 'DELETE', url: `/api/documents/${documentId}` })],
  ['pinDocument', ({ documentId }) => ({ method: 'PUT', url: `/api/documents/${documentId}/pin` })],
  ['unpinDocument', ({ documentId }) => ({ method: 'DELETE', url: `/api/documents/${documentId}/pin` })],
  ['listThreads', ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/threads` })],
  [
    'createThread',
    ({ documentId }) => ({
      method: 'POST',
      url: `/api/documents/${documentId}/threads`,
      body: { anchor, quote, body: 'A comment' },
    }),
  ],
  [
    'replyToThread',
    ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/replies`, body: { body: 'A comment' } }),
  ],
  ['resolveThread', ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/resolve` })],
  ['reopenThread', ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/reopen` })],
  [
    'updateComment',
    ({ commentId }) => ({ method: 'PATCH', url: `/api/comments/${commentId}`, body: { body: 'Edited' } }),
  ],
  ['deleteComment', ({ commentId }) => ({ method: 'DELETE', url: `/api/comments/${commentId}` })],
  ['listMembers', ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/members` })],
  [
    'addMember',
    ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/members`,
      body: { email: 'lucia@harborpine.example', role: 'member' },
    }),
  ],
  [
    'updateMember',
    ({ workspaceId, userId }) => ({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/members/${userId}`,
      body: { role: 'owner' },
    }),
  ],
  [
    'removeMember',
    ({ workspaceId, userId }) => ({ method: 'DELETE', url: `/api/workspaces/${workspaceId}/members/${userId}` }),
  ],
  ['listAccess', ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/access` })],
  [
    'setAccess',
    ({ documentId, userId }) => ({
      method: 'PUT',
      url: `/api/documents/${documentId}/access/${userId}`,
      body: { role: 'editor' },
    }),
  ],
  [
    'removeAccess',
    ({ documentId, userId }) => ({ method: 'DELETE', url: `/api/documents/${documentId}/access/${userId}` }),
  ],
  ['listVersions', ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/versions` })],
  ['createVersion', ({ documentId }) => ({ method: 'POST', url: `/api/documents/${documentId}/versions` })],
  ['getVersionContent', ({ versionId }) => ({ method: 'GET', url: `/api/versions/${versionId}/content` })],
  ['restoreVersion', ({ versionId }) => ({ method: 'POST', url: `/api/versions/${versionId}/restore` })],
  [
    'setGeneralAccess',
    ({ documentId }) => ({
      method: 'PUT',
      url: `/api/documents/${documentId}/general-access`,
      body: { generalAccess: 'editor' },
    }),
  ],
]

const missing = (): Ids => ({
  workspaceId: randomUUID(),
  documentId: randomUUID(),
  folderId: randomUUID(),
  threadId: randomUUID(),
  commentId: randomUUID(),
  versionId: randomUUID(),
  userId: randomUUID(),
})

describe.each(routes)('%s', (_operationId, call) => {
  // Alice belongs to a workspace and Zoe owns one: the id of a third must not open for either.
  it.each([
    ['a member of another workspace', () => setting.alice],
    ['the owner of another workspace', () => setting.zoe],
  ])(
    'answers the id of a workspace of which %s is not part exactly as an id that does not exist',
    async (_who, person) => {
      const asked = await api({ as: person(), ...call(setting.foreign) })
      const unknown = await api({ as: person(), ...call(missing()) })

      expect(unknown).toMatchObject({ statusCode: 404, body: notFound })
      expect({ statusCode: asked.statusCode, body: asked.body, type: asked.headers['content-type'] }).toEqual({
        statusCode: unknown.statusCode,
        body: unknown.body,
        type: unknown.headers['content-type'],
      })
    },
  )
})

describe('a document of her own workspace that Alice cannot read', () => {
  it.each(routes.filter(([operationId]) => /(Document|Access)$/.test(operationId) && operationId !== 'createDocument'))(
    'answers %s as an id that does not exist',
    async (_operationId, call) => {
      const asked = await api({ as: setting.alice, ...call({ ...setting.foreign, ...setting.hidden }) })

      expect(asked).toMatchObject({ statusCode: 404, body: notFound })
    },
  )

  // Its threads and comments are hers to know about exactly when the document is: asking by their own ids changes nothing.
  it.each(routes.filter(([operationId]) => /Thread|Comment/.test(operationId)))(
    'answers %s, for its threads and comments, as an id that does not exist',
    async (_operationId, call) => {
      const asked = await api({ as: setting.alice, ...call({ ...setting.foreign, ...setting.hidden }) })

      expect(asked).toMatchObject({ statusCode: 404, body: notFound })
    },
  )

  // The same for its versions, by the id of the document and by their own.
  it.each(routes.filter(([operationId]) => /Version/.test(operationId)))(
    'answers %s, for its versions, as an id that does not exist',
    async (_operationId, call) => {
      const asked = await api({ as: setting.alice, ...call({ ...setting.foreign, ...setting.hidden }) })

      expect(asked).toMatchObject({ statusCode: 404, body: notFound })
    },
  )
})

describe('a reference to a folder', () => {
  const unknownFolder = {
    type: '/problems/validation-failed',
    title: 'The request is not valid.',
    status: 400,
    code: 'validation-failed',
  }

  it('in another workspace is refused exactly as a folder that does not exist, when creating a document', async () => {
    const create = (folderId: string) =>
      api({
        as: setting.alice,
        method: 'POST',
        url: `/api/workspaces/${setting.workspaceId}/documents`,
        body: { title: 'Budget', folderId },
      })

    const foreign = await create(setting.foreign.folderId)
    const unknown = await create(randomUUID())

    expect(unknown).toMatchObject({
      statusCode: 400,
      body: { ...unknownFolder, errors: [{ pointer: '/folderId', code: 'invalid-value' }] },
    })
    expect(foreign.body).toEqual(unknown.body)
  })

  it('in another workspace is refused exactly as one that does not exist, when moving a document', async () => {
    const documentId = await createDocument(db, { workspaceId: setting.workspaceId, creator: setting.alice })
    const move = (folderId: string) =>
      api({ as: setting.alice, method: 'PATCH', url: `/api/documents/${documentId}`, body: { folderId, revision: 1 } })

    const foreign = await move(setting.foreign.folderId)
    const unknown = await move(randomUUID())

    expect(unknown.statusCode).toBe(400)
    expect(foreign).toMatchObject({ statusCode: 400, body: unknown.body })
  })

  it('in another workspace is refused exactly as one that does not exist, when filtering a list', async () => {
    const list = (folderId: string) =>
      api({
        as: setting.alice,
        method: 'GET',
        url: `/api/workspaces/${setting.workspaceId}/documents?folderId=${folderId}`,
      })

    const foreign = await list(setting.foreign.folderId)
    const unknown = await list(randomUUID())

    expect(unknown).toMatchObject({
      statusCode: 400,
      body: { errors: [{ pointer: '/query/folderId', code: 'invalid-value' }] },
    })
    expect(foreign.body).toEqual(unknown.body)
  })
})

describe('searching for documents', () => {
  const word = 'zanzibar'
  let reader: Person
  let workspaceId: string
  beforeAll(async () => {
    reader = await createPerson(db, 'Camila Ortega')
    const writer = await createPerson(db, 'Daniel Okafor')
    workspaceId = await createWorkspace(db, 'Search')
    await join(db, workspaceId, reader)
    await join(db, workspaceId, writer)
    const otherId = await createWorkspace(db, 'Elsewhere')
    await join(db, otherId, writer, 'owner')
    await join(db, otherId, reader)

    await createDocument(db, { workspaceId, creator: reader, title: `Visible ${word}` })
    await createDocument(db, {
      workspaceId,
      creator: reader,
      title: 'Visible by excerpt',
      excerpt: `A plan for ${word}`,
    })
    await createDocument(db, { workspaceId, creator: writer, title: `Private ${word}` })
    await createDocument(db, { workspaceId, creator: writer, title: 'Private by excerpt', excerpt: `${word} budget` })
    await createDocument(db, { workspaceId, creator: writer, title: `Archived of the writer ${word}`, archived: true })
    await createDocument(db, { workspaceId, creator: reader, title: `Archived of the reader ${word}`, archived: true })
    await createDocument(db, {
      workspaceId,
      creator: writer,
      title: `Open to the workspace ${word}`,
      generalAccess: 'viewer',
    })
    await createDocument(db, {
      workspaceId: otherId,
      creator: writer,
      title: `Other workspace ${word}`,
      generalAccess: 'editor',
    })
  })

  const titles = async (query: string, extra = ''): Promise<string[]> => {
    const { body } = await api({
      as: reader,
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/documents?query=${encodeURIComponent(query)}${extra}`,
    })
    return (body as { items: { title: string }[] }).items.map((item) => item.title).sort()
  }

  it('finds only what the person can read, in the title and in the excerpt', async () => {
    expect(await titles(word)).toEqual([`Open to the workspace ${word}`, 'Visible by excerpt', `Visible ${word}`])
  })

  it('does not match on a document it must not show, however the text is cased', async () => {
    expect(await titles(word.toUpperCase())).toEqual(await titles(word))
    expect(await titles('private')).toEqual([])
  })

  it('finds archived documents only among the ones the person owns', async () => {
    expect(await titles(word, '&archived=true')).toEqual([`Archived of the reader ${word}`])
  })

  it('takes % and _ as the characters they are, not as wildcards', async () => {
    expect(await titles('%')).toEqual([])
    expect(await titles('_isible')).toEqual([])
  })
})
