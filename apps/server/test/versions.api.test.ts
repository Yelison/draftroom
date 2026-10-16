import type { Schema } from '@draftroom/contract'
import type { StatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import type { DocumentBroadcaster } from '../src/http/document-broadcaster.ts'
import { apiOf, bodyAs, notFound, type Api } from './support/api.ts'
import { documentWith, storeState } from './support/collab/content.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createVersion, versionsOf } from './support/versions.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// What the versions API does, by the rules of docs/api/README.md. Who may do what is the access matrix's; these tests are
// about what the operations answer and leave behind once they are allowed.

type Version = Schema<'Version'>
type VersionPage = Schema<'VersionPage'>

const told: Array<{ documentId: string; event: StatelessEvent }> = []
const broadcaster: DocumentBroadcaster = { broadcast: (documentId, event) => told.push({ documentId, event }) }

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let workspaceId: string
let people: Record<'owner' | 'editor' | 'viewer' | 'outsider', Person>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db, undefined, broadcaster)
  api = apiOf(server)
  workspaceId = await createWorkspace(db)
  people = {
    owner: await createPerson(db, 'Marta Ruiz'),
    editor: await createPerson(db, 'Priya Raman'),
    viewer: await createPerson(db, 'Tom Weller'),
    outsider: await createPerson(db, 'Lucía Fernández'),
  }
  await join(db, workspaceId, people.owner, 'owner')
  for (const person of [people.editor, people.viewer]) await join(db, workspaceId, person)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

/** A document everyone but the outsider holds a role on, with this content stored. */
async function freshDocument(...paragraphs: string[]): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: people.owner })
  await grant(db, { workspaceId, documentId, person: people.editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: people.viewer, role: 'viewer' })
  if (paragraphs.length > 0) await storeState(db, documentId, Y.encodeStateAsUpdate(documentWith(...paragraphs)))
  return documentId
}

const list = async (as: Person, documentId: string, query = ''): Promise<VersionPage> =>
  bodyAs<VersionPage>(await api({ as, method: 'GET', url: `/api/documents/${documentId}/versions${query}` }))

const eventsOf = (documentId: string) =>
  db
    .selectFrom('activity_events')
    .select(['type', 'actor_id'])
    .where('document_id', '=', documentId)
    .orderBy('created_at')
    .execute()

describe('listing the versions of a document', () => {
  it('gives the newest first, each with its kind, label, author and size', async () => {
    const documentId = await freshDocument()
    const state = Y.encodeStateAsUpdate(documentWith('Autumn plan'))
    await createVersion(db, { workspaceId, documentId, kind: 'auto', createdAt: '2026-10-13T09:00:00Z' })
    await createVersion(db, {
      workspaceId,
      documentId,
      kind: 'manual',
      author: people.editor,
      label: 'Before the workshop edits',
      state,
      createdAt: '2026-10-13T10:00:00Z',
    })

    const page = await list(people.viewer, documentId)

    expect(page).toEqual({
      items: [
        {
          id: expect.any(String),
          documentId,
          kind: 'manual',
          label: 'Before the workshop edits',
          createdBy: { id: people.editor.id, name: 'Priya Raman' },
          createdAt: '2026-10-13T10:00:00.000Z',
          sizeBytes: state.byteLength,
        },
        {
          id: expect.any(String),
          documentId,
          kind: 'auto',
          label: null,
          createdBy: null,
          createdAt: '2026-10-13T09:00:00.000Z',
          sizeBytes: 2,
        },
      ],
      nextCursor: null,
    })
  })

  it('is empty for a document with no versions', async () => {
    expect(await list(people.viewer, await freshDocument())).toEqual({ items: [], nextCursor: null })
  })

  it('pages through the versions with a cursor, newest first and none twice, even when two share an instant', async () => {
    const documentId = await freshDocument()
    const ids: string[] = []
    for (const createdAt of [
      '2026-10-13T09:00:00Z',
      '2026-10-13T10:00:00Z',
      '2026-10-13T10:00:00Z',
      '2026-10-13T11:00:00Z',
      '2026-10-13T12:00:00Z',
    ]) {
      ids.push(await createVersion(db, { workspaceId, documentId, author: people.owner, createdAt }))
    }

    const first = await list(people.owner, documentId, '?limit=2')
    const second = await list(people.owner, documentId, `?limit=2&cursor=${first.nextCursor}`)
    const third = await list(people.owner, documentId, `?limit=2&cursor=${second.nextCursor}`)

    const seen = [...first.items, ...second.items, ...third.items].map((version) => version.id)
    expect(seen).toHaveLength(5)
    expect(new Set(seen)).toEqual(new Set(ids))
    expect([first.items.length, second.items.length, third.items.length, third.nextCursor]).toEqual([2, 2, 1, null])
    // Newest first, and among two made at the same instant the one with the larger id first.
    const stamps = [...first.items, ...second.items, ...third.items].map((version) => version.createdAt)
    expect(stamps).toEqual([...stamps].sort().reverse())
  })

  it('refuses a cursor that was made for the versions of another document', async () => {
    const documentId = await freshDocument()
    const otherId = await freshDocument()
    for (const id of [documentId, documentId, otherId])
      await createVersion(db, { workspaceId, documentId: id, author: people.owner })
    const { nextCursor } = await list(people.owner, documentId, '?limit=1')

    const response = await api({
      as: people.owner,
      method: 'GET',
      url: `/api/documents/${otherId}/versions?cursor=${nextCursor}`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.body).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/query/cursor', code: 'invalid-value' }],
    })
  })

  it('does not show the versions of an archived document, not even to its owner', async () => {
    const documentId = await createDocument(db, { workspaceId, creator: people.owner, archived: true })
    await createVersion(db, { workspaceId, documentId, author: people.owner })

    const response = await api({ as: people.owner, method: 'GET', url: `/api/documents/${documentId}/versions` })

    expect([response.statusCode, response.body]).toEqual([404, notFound])
  })

  it('answers a document the person cannot read as it answers one that is not there', async () => {
    const documentId = await freshDocument()

    const outsider = await api({ as: people.outsider, method: 'GET', url: `/api/documents/${documentId}/versions` })
    const missing = await api({
      as: people.owner,
      method: 'GET',
      url: '/api/documents/6f1c1a52-8f58-4a2e-9a1b-0c1d2e3f4a5b/versions',
    })

    expect([outsider.statusCode, outsider.body]).toEqual([404, notFound])
    expect(outsider.body).toEqual(missing.body)
  })
})

describe('saving a version', () => {
  it('keeps the stored state under the label and the name of the person, and gives the version', async () => {
    const documentId = await freshDocument('Autumn plan')
    told.length = 0

    const response = await api({
      as: people.editor,
      method: 'POST',
      url: `/api/documents/${documentId}/versions`,
      body: { label: 'Before the workshop edits' },
    })

    expect(response.statusCode).toBe(201)
    const version = bodyAs<Version>(response)
    expect(version).toMatchObject({
      documentId,
      kind: 'manual',
      label: 'Before the workshop edits',
      createdBy: { id: people.editor.id, name: 'Priya Raman' },
    })
    const [saved] = await versionsOf(db, documentId)
    expect(saved?.id).toBe(version.id)
    expect(version.sizeBytes).toBe(saved?.state.byteLength)
  })

  it('takes a body that is left out, and a label of a hundred characters', async () => {
    const documentId = await freshDocument()

    const bare = await api({ as: people.owner, method: 'POST', url: `/api/documents/${documentId}/versions` })
    const long = await api({
      as: people.owner,
      method: 'POST',
      url: `/api/documents/${documentId}/versions`,
      body: { label: '😀'.repeat(100) },
    })

    expect([bare.statusCode, bodyAs<Version>(bare).label, long.statusCode]).toEqual([201, null, 201])
  })

  it('refuses a label of a hundred and one characters before it looks for the document, whoever asks', async () => {
    const documentId = await freshDocument()
    const body = { label: '😀'.repeat(101) }

    const owner = await api({ as: people.owner, method: 'POST', url: `/api/documents/${documentId}/versions`, body })
    const outsider = await api({
      as: people.outsider,
      method: 'POST',
      url: `/api/documents/${documentId}/versions`,
      body,
    })

    expect([owner.statusCode, outsider.statusCode]).toEqual([413, 413])
    expect(await versionsOf(db, documentId)).toEqual([])
  })

  it('records who saved it in the history, and tells the people who have the document open', async () => {
    const documentId = await freshDocument('Autumn plan')
    told.length = 0

    await api({ as: people.editor, method: 'POST', url: `/api/documents/${documentId}/versions` })

    expect(await eventsOf(documentId)).toEqual([{ type: 'version.created', actor_id: people.editor.id }])
    expect(told).toEqual([{ documentId, event: { type: 'versions-changed' } }])
  })

  it('saves nothing, records nothing and tells nobody when the role does not allow it', async () => {
    const documentId = await freshDocument('Autumn plan')
    told.length = 0

    const response = await api({ as: people.viewer, method: 'POST', url: `/api/documents/${documentId}/versions` })

    expect(response.statusCode).toBe(403)
    expect([await versionsOf(db, documentId), await eventsOf(documentId), told]).toEqual([[], [], []])
  })
})

describe('downloading the content of a version', () => {
  it('serves the bytes the version holds, exactly, as a Yjs update', async () => {
    const documentId = await freshDocument()
    const state = Y.encodeStateAsUpdate(documentWith('First', 'Second'))
    const versionId = await createVersion(db, { workspaceId, documentId, author: people.owner, state })

    const response = await api({ as: people.viewer, method: 'GET', url: `/api/versions/${versionId}/content` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(new Uint8Array(response.rawBody)).toEqual(state)
    const preview = new Y.Doc()
    Y.applyUpdate(preview, new Uint8Array(response.rawBody))
    expect(preview.getXmlFragment('default').length).toBe(2)
  })

  it('answers alike for a version that is not there, one the person cannot read and one of an archived document', async () => {
    const documentId = await freshDocument()
    const hidden = await createVersion(db, { workspaceId, documentId, author: people.owner })
    const archivedId = await createDocument(db, { workspaceId, creator: people.owner, archived: true })
    const inArchived = await createVersion(db, { workspaceId, documentId: archivedId, author: people.owner })

    const answers = await Promise.all([
      api({ as: people.outsider, method: 'GET', url: `/api/versions/${hidden}/content` }),
      api({ as: people.owner, method: 'GET', url: '/api/versions/6f1c1a52-8f58-4a2e-9a1b-0c1d2e3f4a5b/content' }),
      api({ as: people.owner, method: 'GET', url: `/api/versions/${inArchived}/content` }),
    ])

    expect(answers.map(({ statusCode, body }) => [statusCode, body])).toEqual([
      [404, notFound],
      [404, notFound],
      [404, notFound],
    ])
  })
})
