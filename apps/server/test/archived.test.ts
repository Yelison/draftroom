import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, type Api, type Call } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// An archived document is the owners' and nobody else's: they can read it, restore it and delete it, and every other
// operation, theirs included, answers 404 until it is restored. Everyone else gets the 404 for all of it.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let workspaceId: string
let people: Record<'workspaceOwner' | 'explicitOwner' | 'editor' | 'viewer' | 'member', Person>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  workspaceId = await createWorkspace(db)
  people = {
    workspaceOwner: await createPerson(db, 'Marta Ruiz'),
    explicitOwner: await createPerson(db, 'Daniel Okafor'),
    editor: await createPerson(db, 'Priya Raman'),
    viewer: await createPerson(db, 'Tom Weller'),
    member: await createPerson(db, 'Lucía Fernández'),
  }
  await join(db, workspaceId, people.workspaceOwner, 'owner')
  for (const person of [people.explicitOwner, people.editor, people.viewer, people.member]) {
    await join(db, workspaceId, person)
  }
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

/** An archived document that everyone in `people` is related to in their own way, and a note of who pinned it. */
async function archivedDocument(): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: people.explicitOwner, archived: true })
  await grant(db, { workspaceId, documentId, person: people.editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: people.viewer, role: 'viewer' })
  return documentId
}

const owners = ['workspaceOwner', 'explicitOwner'] as const
const others = ['editor', 'viewer', 'member'] as const

interface Route {
  readonly operationId: string
  call(documentId: string): Omit<Call, 'as'>
  /** What an owner gets: only the three operations that apply to an archived document answer. */
  readonly ownerGets: number
}

const routes: readonly Route[] = [
  { operationId: 'getDocument', call: (id) => ({ method: 'GET', url: `/api/documents/${id}` }), ownerGets: 200 },
  {
    operationId: 'restoreDocument',
    call: (id) => ({ method: 'POST', url: `/api/documents/${id}/restore` }),
    ownerGets: 200,
  },
  { operationId: 'deleteDocument', call: (id) => ({ method: 'DELETE', url: `/api/documents/${id}` }), ownerGets: 204 },
  {
    operationId: 'updateDocument',
    call: (id) => ({ method: 'PATCH', url: `/api/documents/${id}`, body: { title: 'Renamed', revision: 1 } }),
    ownerGets: 404,
  },
  {
    operationId: 'archiveDocument',
    call: (id) => ({ method: 'POST', url: `/api/documents/${id}/archive` }),
    ownerGets: 404,
  },
  { operationId: 'pinDocument', call: (id) => ({ method: 'PUT', url: `/api/documents/${id}/pin` }), ownerGets: 404 },
  {
    operationId: 'unpinDocument',
    call: (id) => ({ method: 'DELETE', url: `/api/documents/${id}/pin` }),
    ownerGets: 404,
  },
]

describe.each(routes)('$operationId on an archived document', ({ call, ownerGets }) => {
  it.each(owners)(`answers its owner (%s) with ${ownerGets}`, async (owner) => {
    const response = await api({ as: people[owner], ...call(await archivedDocument()) })

    expect(response.statusCode).toBe(ownerGets)
  })

  it.each(others)('answers 404 to a person who is not an owner (%s), whatever their role', async (other) => {
    const response = await api({ as: people[other], ...call(await archivedDocument()) })

    expect(response.statusCode).toBe(404)
  })
})

describe('the lists', () => {
  let documentId: string
  beforeAll(async () => {
    documentId = await archivedDocument()
    // Pinned before it was archived: the pin stays, and the list must not show an archived document.
    for (const person of [people.explicitOwner, people.editor]) {
      await db
        .insertInto('pins')
        .values({ workspace_id: workspaceId, document_id: documentId, user_id: person.id })
        .execute()
    }
  })

  const idsOf = async (as: Person, path: string): Promise<string[]> => {
    const { body } = await api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}/${path}` })
    return (body as { items: { id: string }[] }).items.map((item) => item.id)
  }

  it.each([...owners, ...others])('keep an archived document out of the live list for %s', async (name) => {
    expect(await idsOf(people[name], 'documents')).not.toContain(documentId)
  })

  it.each(owners)('show an archived document to its owner (%s) in the archive', async (name) => {
    expect(await idsOf(people[name], 'documents?archived=true')).toContain(documentId)
  })

  it.each(others)(
    'do not show an archived document in the archive of a person who is not an owner (%s)',
    async (name) => {
      expect(await idsOf(people[name], 'documents?archived=true')).not.toContain(documentId)
    },
  )

  it('keep an archived document out of the pinned list, though it is still pinned', async () => {
    expect(await idsOf(people.explicitOwner, 'pinned')).not.toContain(documentId)
    expect(await idsOf(people.editor, 'pinned')).not.toContain(documentId)
  })

  it('keep an archived document out of the shared list', async () => {
    expect(await idsOf(people.editor, 'shared')).not.toContain(documentId)
    expect(await idsOf(people.viewer, 'shared')).not.toContain(documentId)
  })

  it('give the document back to everyone it was shared with once it is restored, pin included', async () => {
    const restored = await api({
      as: people.explicitOwner,
      method: 'POST',
      url: `/api/documents/${documentId}/restore`,
    })

    expect(restored.statusCode).toBe(200)
    expect(await idsOf(people.editor, 'documents')).toContain(documentId)
    expect(await idsOf(people.editor, 'pinned')).toContain(documentId)
    expect(await idsOf(people.viewer, 'shared')).toContain(documentId)
  })
})
