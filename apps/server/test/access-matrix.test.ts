import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, type Api, type Call } from './support/api.ts'
import { rolesOf } from './support/contract-roles.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { personFor, scenarios } from './support/scenarios.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import {
  createDocument,
  createFolder,
  createPerson,
  createStudio,
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
    operationId: 'listPinnedDocuments',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/pinned` }),
    allowed: 200,
  },
  {
    operationId: 'listSharedDocuments',
    call: ({ workspaceId }) => ({ method: 'GET', url: `/api/workspaces/${workspaceId}/shared` }),
    allowed: 200,
  },
]

const workspaceRoles = ['owner', 'member', 'outsider'] as const

describe.each(workspaceCases)('$operationId in a workspace', ({ operationId, call, allowed }) => {
  it.each(workspaceRoles)('as a workspace %s', async (workspaceRole) => {
    const subject = await createPerson(db, `A ${workspaceRole}`)
    if (workspaceRole !== 'outsider') await join(db, studio.workspaceId, subject, workspaceRole)
    const folderId = await createFolder(db, studio.workspaceId)

    const response = await api({ as: subject, ...call({ workspaceId: studio.workspaceId, folderId }) })

    const mayDo = workspaceRole !== 'outsider' && rolesOf(operationId).roles.includes(workspaceRole)
    expect(response.statusCode).toBe(workspaceRole === 'outsider' ? 404 : mayDo ? allowed : 403)
  })
})

describe('the operations that need a session and nothing else', () => {
  it.each(['getMe', 'listWorkspaces'])('%s answers anyone who is signed in', async (operationId) => {
    const subject = await createPerson(db, 'Someone with no workspace')
    expect(rolesOf(operationId).scope).toBe('session')

    const response = await api({
      as: subject,
      method: 'GET',
      url: operationId === 'getMe' ? '/api/me' : '/api/workspaces',
    })

    expect(response.statusCode).toBe(200)
  })
})
