import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, type Api, type Call } from './support/api.ts'
import { startCollab, type CollabHarness } from './support/collab/harness.ts'
import { anchor, createThread, quote } from './support/comments.ts'
import { contractAllows, rolesOf } from './support/contract-roles.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { personFor, scenarios } from './support/scenarios.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createVersion } from './support/versions.ts'
import {
  createDocument,
  createFolder,
  createPerson,
  createStudio,
  grant,
  join,
  type Person,
  type Studio,
} from './support/world.ts'

// Plan §4.3 and ADR 0005, every implemented operation against every role. What each role may do comes from the
// contract (`rolesOf`), not from the server's own table, and every answer is held to the contract by the client.
// Later tasks add their operations as rows to the tables below.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let studio: Studio
let collab: CollabHarness
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  // The versions are saved from, and restored into, the documents the collaboration server holds.
  collab = await startCollab(db)
  server = createTestApp(db, undefined, undefined, undefined, undefined, collab.server.documents)
  api = apiOf(server)
  studio = await createStudio(db)
})
afterAll(async () => {
  await server.app.close()
  await collab.close()
  await database.drop()
})

interface DocumentCase {
  readonly operationId: string
  /** The call, for a document that is live. */
  call(documentId: string): Omit<Call, 'as'>
  /** What the call answers once the role allows it. A live document cannot be deleted: that is the 409 after the check. */
  readonly allowed: number
}

const documentCases: readonly DocumentCase[] = [
  { operationId: 'getDocument', call: (id) => ({ method: 'GET', url: `/api/documents/${id}` }), allowed: 200 },
  {
    operationId: 'updateDocument',
    call: (id) => ({
      method: 'PATCH',
      url: `/api/documents/${id}`,
      body: { title: 'Autumn launch plan v2', revision: 1 },
    }),
    allowed: 200,
  },
  {
    operationId: 'archiveDocument',
    call: (id) => ({ method: 'POST', url: `/api/documents/${id}/archive` }),
    allowed: 200,
  },
  {
    operationId: 'restoreDocument',
    call: (id) => ({ method: 'POST', url: `/api/documents/${id}/restore` }),
    allowed: 200,
  },
  { operationId: 'deleteDocument', call: (id) => ({ method: 'DELETE', url: `/api/documents/${id}` }), allowed: 409 },
  {
    operationId: 'listDocumentActivity',
    call: (id) => ({ method: 'GET', url: `/api/documents/${id}/activity` }),
    allowed: 200,
  },
  { operationId: 'pinDocument', call: (id) => ({ method: 'PUT', url: `/api/documents/${id}/pin` }), allowed: 204 },
  { operationId: 'unpinDocument', call: (id) => ({ method: 'DELETE', url: `/api/documents/${id}/pin` }), allowed: 204 },
]

/** A fresh document and a fresh person set up as the scenario says, so no test sees what another changed. */
async function arranged(scenario: (typeof scenarios)[number]): Promise<{ subject: Person; documentId: string }> {
  const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
  const subject = await personFor(db, scenario)
  await scenario.arrange({ db, workspaceId: studio.workspaceId, documentId, subject })
  return { subject, documentId }
}

describe.each(documentCases)('$operationId on a document', ({ operationId, call, allowed }) => {
  it.each(scenarios)('as a $name ($role)', async (scenario) => {
    const { subject, documentId } = await arranged(scenario)

    const response = await api({ as: subject, ...call(documentId) })

    const mayDo = scenario.role !== null && rolesOf(operationId).roles.includes(scenario.role)
    // No role: the document does not exist for this person. A role the matrix refuses: it exists, and they may not.
    const expected = scenario.role === null ? 404 : mayDo ? allowed : 403
    expect(response.statusCode).toBe(expected)
  })
})

interface ThreadCase {
  readonly operationId: string
  call(ids: { documentId: string; threadId: string }): Omit<Call, 'as'>
  readonly allowed: number
}

// Rows of the matrix that need the role and nothing else: who may read comments, start a thread, reply, resolve, reopen.
const threadCases: readonly ThreadCase[] = [
  {
    operationId: 'listThreads',
    call: ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/threads` }),
    allowed: 200,
  },
  {
    operationId: 'createThread',
    call: ({ documentId }) => ({
      method: 'POST',
      url: `/api/documents/${documentId}/threads`,
      body: { anchor, quote, body: 'Does the workshop fit before then?' },
    }),
    allowed: 201,
  },
  {
    operationId: 'replyToThread',
    call: ({ threadId }) => ({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      body: { body: 'Yes, on the 4th.' },
    }),
    allowed: 201,
  },
  {
    operationId: 'resolveThread',
    call: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/resolve` }),
    allowed: 200,
  },
  {
    operationId: 'reopenThread',
    call: ({ threadId }) => ({ method: 'POST', url: `/api/threads/${threadId}/reopen` }),
    allowed: 200,
  },
]

describe.each(threadCases)('$operationId on the threads of a document', ({ operationId, call, allowed }) => {
  it.each(scenarios)('as a $name ($role)', async (scenario) => {
    const { subject, documentId } = await arranged(scenario)
    // Somebody else's thread: these rows do not depend on who wrote it.
    const { threadId } = await createThread(db, { workspaceId: studio.workspaceId, documentId, author: studio.owner })

    const response = await api({ as: subject, ...call({ documentId, threadId }) })

    const mayDo = scenario.role !== null && rolesOf(operationId).roles.includes(scenario.role)
    expect(response.statusCode).toBe(scenario.role === null ? 404 : mayDo ? allowed : 403)
  })
})

interface VersionCase {
  readonly operationId: string
  call(ids: { documentId: string; versionId: string }): Omit<Call, 'as'>
  readonly allowed: number
}

// Listing, previewing and saving a version, and restoring one, which only an owner may do.
const versionCases: readonly VersionCase[] = [
  {
    operationId: 'listVersions',
    call: ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/versions` }),
    allowed: 200,
  },
  {
    operationId: 'createVersion',
    call: ({ documentId }) => ({ method: 'POST', url: `/api/documents/${documentId}/versions` }),
    allowed: 201,
  },
  {
    operationId: 'getVersionContent',
    call: ({ versionId }) => ({ method: 'GET', url: `/api/versions/${versionId}/content` }),
    allowed: 200,
  },
  {
    operationId: 'restoreVersion',
    call: ({ versionId }) => ({ method: 'POST', url: `/api/versions/${versionId}/restore` }),
    allowed: 200,
  },
]

describe.each(versionCases)('$operationId on the versions of a document', ({ operationId, call, allowed }) => {
  it.each(scenarios)('as a $name ($role)', async (scenario) => {
    const { subject, documentId } = await arranged(scenario)
    const versionId = await createVersion(db, { workspaceId: studio.workspaceId, documentId, author: studio.owner })

    const response = await api({ as: subject, ...call({ documentId, versionId }) })

    const mayDo = scenario.role !== null && rolesOf(operationId).roles.includes(scenario.role)
    expect(response.statusCode).toBe(scenario.role === null ? 404 : mayDo ? allowed : 403)
  })
})

describe('the versions of an archived document', () => {
  it.each(versionCases)('are not reachable by $operationId, not even by the owner', async ({ call }) => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })
    const versionId = await createVersion(db, { workspaceId: studio.workspaceId, documentId, author: studio.owner })

    const response = await api({ as: studio.owner, ...call({ documentId, versionId }) })

    expect(response.statusCode).toBe(404)
  })
})

interface CommentCase {
  readonly operationId: string
  call(commentId: string): Omit<Call, 'as'>
  readonly allowed: number
}

// Rows that also depend on who wrote the comment: only the author edits, the author or an owner deletes. What each role
// gets comes from the rows of the contract, and every case is tried on a comment of the person and on somebody else's.
const commentCases: readonly CommentCase[] = [
  {
    operationId: 'updateComment',
    call: (commentId) => ({ method: 'PATCH', url: `/api/comments/${commentId}`, body: { body: 'Yes, on the 5th.' } }),
    allowed: 200,
  },
  {
    operationId: 'deleteComment',
    call: (commentId) => ({ method: 'DELETE', url: `/api/comments/${commentId}` }),
    allowed: 204,
  },
]

describe.each(commentCases)('$operationId on a comment', ({ operationId, call, allowed }) => {
  describe.each([true, false])('written by the person: %s', (isAuthor) => {
    it.each(scenarios)('as a $name ($role)', async (scenario) => {
      const { subject, documentId } = await arranged(scenario)
      const author = isAuthor ? subject : studio.owner
      const { commentId } = await createThread(db, { workspaceId: studio.workspaceId, documentId, author })

      const response = await api({ as: subject, ...call(commentId) })

      const mayDo = scenario.role !== null && contractAllows(operationId, scenario.role, { isAuthor })
      expect(response.statusCode).toBe(scenario.role === null ? 404 : mayDo ? allowed : 403)
    })
  })
})

interface AccessCase {
  readonly operationId: string
  call(ids: { documentId: string; colleagueId: string }): Omit<Call, 'as'>
  readonly allowed: number
}

// Who reads and changes the access of a document: only its owners, whatever the way they came to be one. The colleague is
// somebody else with an editor grant, so that every call has something to read, change or remove.
const accessCases: readonly AccessCase[] = [
  {
    operationId: 'listAccess',
    call: ({ documentId }) => ({ method: 'GET', url: `/api/documents/${documentId}/access` }),
    allowed: 200,
  },
  {
    operationId: 'setAccess',
    call: ({ documentId, colleagueId }) => ({
      method: 'PUT',
      url: `/api/documents/${documentId}/access/${colleagueId}`,
      body: { role: 'viewer' },
    }),
    allowed: 200,
  },
  {
    operationId: 'removeAccess',
    call: ({ documentId, colleagueId }) => ({
      method: 'DELETE',
      url: `/api/documents/${documentId}/access/${colleagueId}`,
    }),
    allowed: 204,
  },
  {
    operationId: 'setGeneralAccess',
    call: ({ documentId }) => ({
      method: 'PUT',
      url: `/api/documents/${documentId}/general-access`,
      body: { generalAccess: 'viewer' },
    }),
    allowed: 200,
  },
]

describe.each(accessCases)('$operationId on the access of a document', ({ operationId, call, allowed }) => {
  it.each(scenarios)('as a $name ($role)', async (scenario) => {
    const { subject, documentId } = await arranged(scenario)
    const colleague = await createPerson(db, 'A colleague')
    await join(db, studio.workspaceId, colleague)
    await grant(db, { workspaceId: studio.workspaceId, documentId, person: colleague, role: 'editor' })

    const response = await api({ as: subject, ...call({ documentId, colleagueId: colleague.id }) })

    const mayDo = scenario.role !== null && rolesOf(operationId).roles.includes(scenario.role)
    expect(response.statusCode).toBe(scenario.role === null ? 404 : mayDo ? allowed : 403)
  })

  it.each(scenarios.filter((scenario) => scenario.role !== null && scenario.role !== 'owner'))(
    'is refused to a $name before anyone is told whether the person it names exists',
    async (scenario) => {
      const { subject, documentId } = await arranged(scenario)

      const response = await api({ as: subject, ...call({ documentId, colleagueId: randomUUID() }) })

      expect(response.statusCode).toBe(403)
    },
  )
})

describe('the access of an archived document', () => {
  it.each(accessCases)('is not reachable by $operationId, not even by the owner', async ({ call }) => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })
    const colleague = await createPerson(db, 'A colleague')
    await join(db, studio.workspaceId, colleague)
    await grant(db, { workspaceId: studio.workspaceId, documentId, person: colleague, role: 'editor' })

    const response = await api({ as: studio.owner, ...call({ documentId, colleagueId: colleague.id }) })

    expect(response.statusCode).toBe(404)
  })
})

describe('the document a person reads', () => {
  it.each(scenarios.filter((scenario) => scenario.role !== null))(
    'shows the effective role of a $name, and the sharing settings only to an owner',
    async (scenario) => {
      const { subject, documentId } = await arranged(scenario)

      const response = await api({ as: subject, method: 'GET', url: `/api/documents/${documentId}` })

      expect(response.body).toMatchObject({
        role: scenario.role,
        generalAccess: scenario.role === 'owner' ? expect.stringMatching(/none|viewer|commenter|editor/) : null,
      })
    },
  )
})

describe('the lists of documents', () => {
  const members = scenarios.filter(
    (scenario) =>
      scenario.name !== 'person outside the workspace' && scenario.name !== 'member of another workspace only',
  )

  it.each(members)('hold the document of a $name exactly when they can read it', async (scenario) => {
    const { subject, documentId } = await arranged(scenario)
    const listed = async (url: string): Promise<boolean> => {
      const { body } = await api({ as: subject, method: 'GET', url })
      return (body as { items: { id: string }[] }).items.some((item) => item.id === documentId)
    }

    const readable = (await api({ as: subject, method: 'GET', url: `/api/documents/${documentId}` })).statusCode === 200
    const inList = await listed(`/api/workspaces/${studio.workspaceId}/documents?limit=100`)

    expect(inList).toBe(readable)
    expect(readable).toBe(scenario.role !== null)
  })
})

interface WorkspaceCase {
  readonly operationId: string
  /** Tells apart two rows of one operation, such as a document created from a template. */
  readonly label?: string
  call(ids: { workspaceId: string; folderId: string }): Omit<Call, 'as'>
  readonly allowed: number
}

const workspaceCases: readonly WorkspaceCase[] = [
  {
    operationId: 'getWorkspace',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}` }),
    allowed: 200,
  },
  {
    operationId: 'updateWorkspace',
    call: ({ workspaceId }) => ({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, body: { name: 'Almazara' } }),
    allowed: 200,
  },
  {
    operationId: 'listFolders',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/folders` }),
    allowed: 200,
  },
  {
    operationId: 'createFolder',
    call: ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/folders`,
      body: { name: 'Budget' },
    }),
    allowed: 201,
  },
  {
    operationId: 'updateFolder',
    call: ({ folderId }) => ({
      method: 'PATCH',
      url: `/api/folders/${folderId}`,
      body: { name: 'Launch 2026', revision: 1 },
    }),
    allowed: 200,
  },
  {
    operationId: 'deleteFolder',
    call: ({ folderId }) => ({ method: 'DELETE', url: `/api/folders/${folderId}` }),
    allowed: 204,
  },
  {
    operationId: 'listDocuments',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/documents` }),
    allowed: 200,
  },
  {
    operationId: 'createDocument',
    call: ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      body: { title: 'Budget' },
    }),
    allowed: 201,
  },
  {
    operationId: 'createDocument',
    label: 'from a template',
    call: ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      body: { title: 'Notas', templateId: 'meeting-notes', locale: 'es' },
    }),
    allowed: 201,
  },
  {
    operationId: 'listPinnedDocuments',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/pinned` }),
    allowed: 200,
  },
  {
    operationId: 'listSharedDocuments',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/shared` }),
    allowed: 200,
  },
  {
    operationId: 'listWorkspaceActivity',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/activity` }),
    allowed: 200,
  },
]

const workspaceRoles = ['owner', 'member', 'outsider'] as const

describe.each(workspaceCases.map((row) => ({ ...row, title: [row.operationId, row.label].filter(Boolean).join(' ') })))(
  '$title in a workspace',
  ({ operationId, call, allowed }) => {
    it.each(workspaceRoles)('as a workspace %s', async (workspaceRole) => {
      const subject = await createPerson(db, `A ${workspaceRole}`)
      if (workspaceRole !== 'outsider') await join(db, studio.workspaceId, subject, workspaceRole)
      const folderId = await createFolder(db, studio.workspaceId)

      const response = await api({ as: subject, ...call({ workspaceId: studio.workspaceId, folderId }) })

      const mayDo = workspaceRole !== 'outsider' && rolesOf(operationId).roles.includes(workspaceRole)
      expect(response.statusCode).toBe(workspaceRole === 'outsider' ? 404 : mayDo ? allowed : 403)
    })
  },
)

const sessionOperations: readonly (readonly [string, Omit<Call, 'as'>])[] = [
  ['getMe', { method: 'GET', url: '/api/me' }],
  ['updateMe', { method: 'PATCH', url: '/api/me', body: { editorTextSize: 'large' } }],
  ['listWorkspaces', { method: 'GET', url: '/api/workspaces' }],
  ['listTemplates', { method: 'GET', url: '/api/templates' }],
]

interface MemberCase {
  readonly operationId: string
  call(ids: { workspaceId: string; colleagueId: string }): Omit<Call, 'as'>
  readonly allowed: number
}

const memberCases: readonly MemberCase[] = [
  {
    operationId: 'listMembers',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/members` }),
    allowed: 200,
  },
  {
    operationId: 'addMember',
    call: ({ workspaceId }) => ({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/members`,
      body: { email: `${randomUUID()}@harborpine.example`, role: 'member' },
    }),
    allowed: 201,
  },
  {
    operationId: 'updateMember',
    call: ({ workspaceId, colleagueId }) => ({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/members/${colleagueId}`,
      body: { role: 'owner' },
    }),
    allowed: 200,
  },
  {
    operationId: 'removeMember',
    call: ({ workspaceId, colleagueId }) => ({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/members/${colleagueId}`,
    }),
    allowed: 204,
  },
]

describe.each(memberCases)('$operationId in a workspace', ({ operationId, call, allowed }) => {
  it.each(workspaceRoles)('as a workspace %s', async (workspaceRole) => {
    const subject = await createPerson(db, `A ${workspaceRole}`)
    if (workspaceRole !== 'outsider') await join(db, studio.workspaceId, subject, workspaceRole)
    const colleague = await createPerson(db, 'A colleague')
    await join(db, studio.workspaceId, colleague)

    const response = await api({ as: subject, ...call({ workspaceId: studio.workspaceId, colleagueId: colleague.id }) })

    const mayDo = workspaceRole !== 'outsider' && rolesOf(operationId).roles.includes(workspaceRole)
    expect(response.statusCode).toBe(workspaceRole === 'outsider' ? 404 : mayDo ? allowed : 403)
  })

  it('is refused to a member before anyone is told whether the person it names is in the workspace', async () => {
    const subject = await createPerson(db, 'A member')
    await join(db, studio.workspaceId, subject)

    const response = await api({ as: subject, ...call({ workspaceId: studio.workspaceId, colleagueId: randomUUID() }) })

    expect(response.statusCode).toBe(operationId === 'listMembers' ? 200 : 403)
  })
})

describe('the operations that need a session and nothing else', () => {
  it.each(sessionOperations)('%s answers anyone who is signed in', async (operationId, call) => {
    const subject = await createPerson(db, 'Someone with no workspace')
    expect(rolesOf(operationId).scope).toBe('session')

    const response = await api({ as: subject, ...call })

    expect(response.statusCode).toBe(200)
  })
})
