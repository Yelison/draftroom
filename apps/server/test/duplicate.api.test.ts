import type { Schema } from '@draftroom/contract'
import { MAX_DOCUMENT_STATE_BYTES } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { recordEvent } from './support/activity.ts'
import { createThread } from './support/comments.ts'
import {
  addPositionMigrations,
  appendParagraph,
  positionMigrationsName,
  storedState,
  storeState,
} from './support/collab/content.ts'
import { withAttribute } from './support/collab/forbidden-content.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createVersion } from './support/versions.ts'
import {
  createDocument,
  createFolder,
  createPerson,
  createStudio,
  createWorkspace,
  grant,
  join,
  type Studio,
} from './support/world.ts'

type Document = Schema<'Document'>

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

/** A state with a heading, formatted text and plain paragraphs, and `migrations` entries of about a kilobyte each. */
function stateWith(migrations: number): Uint8Array {
  const doc = new Y.Doc()
  const heading = withAttribute(new Y.XmlElement('heading'), 'level', 2)
  heading.insert(0, [new Y.XmlText('Autumn launch plan')])
  const fragment = doc.getXmlFragment(fragmentName)
  fragment.insert(0, [heading])
  const bold = new Y.XmlElement('paragraph')
  const text = new Y.XmlText()
  text.insert(0, 'Ship ')
  text.insert(5, 'before the fair', { bold: true })
  bold.insert(0, [text])
  fragment.insert(1, [bold])
  appendParagraph(doc, 'The harbour lights came on one by one.')
  addPositionMigrations(doc, migrations)
  return Y.encodeStateAsUpdate(doc)
}

/** A document of the studio whose stored content is this state. */
async function originalWith(state: Uint8Array, options: { folderId?: string } = {}): Promise<string> {
  const documentId = await createDocument(db, {
    workspaceId: studio.workspaceId,
    creator: studio.owner,
    title: 'Autumn launch plan',
    ...options,
  })
  await storeState(db, documentId, state)
  return documentId
}

const duplicate = (documentId: string, body: object = { title: 'Copy of “Autumn launch plan”' }, as = studio.owner) =>
  api({ as, method: 'POST', url: `/api/documents/${documentId}/duplicate`, body })

const documentsTitled = async (title: string) =>
  (await db.selectFrom('documents').select('id').where('title', '=', title).execute()).length

/** Everything the database holds about a document, to show that a request left it exactly as it was. */
async function snapshotOf(documentId: string) {
  return {
    document: await db.selectFrom('documents').selectAll().where('id', '=', documentId).executeTakeFirstOrThrow(),
    state: await db.selectFrom('document_states').selectAll().where('document_id', '=', documentId).executeTakeFirst(),
    events: await db.selectFrom('activity_events').select('type').where('document_id', '=', documentId).execute(),
    access: await db.selectFrom('document_access').selectAll().where('document_id', '=', documentId).execute(),
  }
}

describe('duplicating a document', () => {
  it('answers 201 with a document of the caller, owned by them and shared with nobody', async () => {
    const original = await originalWith(stateWith(0))

    const response = await duplicate(original)

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Document>(response)).toMatchObject({
      workspaceId: studio.workspaceId,
      folderId: null,
      title: 'Copy of “Autumn launch plan”',
      excerpt: 'Ship before the fair',
      revision: 1,
      role: 'owner',
      generalAccess: 'none',
    })
    expect(bodyAs<Document>(response).id).not.toBe(original)
  })

  it('gives the copy the same text and structure, compared as JSON', async () => {
    const state = stateWith(0)
    const original = await originalWith(state)

    const copy = bodyAs<Document>(await duplicate(original))

    expect(yUpdateToJson(await storedState(db, copy.id))).toEqual(yUpdateToJson(state))
  })

  it('leaves out the map of position migrations, which is most of what an edited document weighs', async () => {
    const original = await originalWith(stateWith(300))

    const copy = bodyAs<Document>(await duplicate(original))

    const copied = await storedState(db, copy.id)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, copied)
    expect(doc.getMap(positionMigrationsName).size).toBe(0)
    expect(copied.byteLength).toBeLessThan((await storedState(db, original)).byteLength / 50)
  })

  it('copies a document that is over the size limit, which no one can add to any more', async () => {
    const state = stateWith(Math.ceil(MAX_DOCUMENT_STATE_BYTES / 1000) + 200)
    expect(state.byteLength).toBeGreaterThan(MAX_DOCUMENT_STATE_BYTES)
    const original = await originalWith(state)

    const response = await duplicate(original)

    expect(response.statusCode).toBe(201)
    const copied = await storedState(db, bodyAs<Document>(response).id)
    expect(copied.byteLength).toBeLessThan(MAX_DOCUMENT_STATE_BYTES / 100)
    expect(yUpdateToJson(copied)).toEqual(yUpdateToJson(state))
  })

  it('does not copy comments, versions, access or history, and records only that the copy was created', async () => {
    const original = await originalWith(stateWith(0))
    const colleague = await createPerson(db, 'Lucía Prieto')
    await join(db, studio.workspaceId, colleague)
    await grant(db, { workspaceId: studio.workspaceId, documentId: original, person: colleague, role: 'editor' })
    await createThread(db, { workspaceId: studio.workspaceId, documentId: original, author: colleague })
    await createVersion(db, { workspaceId: studio.workspaceId, documentId: original, author: studio.owner })
    await recordEvent(db, { workspaceId: studio.workspaceId, documentId: original, actor: colleague })

    const copy = bodyAs<Document>(await duplicate(original))

    const snapshot = await snapshotOf(copy.id)
    expect(snapshot.events.map(({ type }) => type)).toEqual(['document.created'])
    expect(snapshot.access.map(({ user_id, role }) => ({ user_id, role }))).toEqual([
      { user_id: studio.owner.id, role: 'owner' },
    ])
    expect(await db.selectFrom('threads').select('id').where('document_id', '=', copy.id).execute()).toEqual([])
    expect(await db.selectFrom('document_versions').select('id').where('document_id', '=', copy.id).execute()).toEqual(
      [],
    )
  })

  it('belongs to whoever duplicates, not to the owner of the original', async () => {
    const original = await originalWith(stateWith(0))
    const reader = await createPerson(db, 'Teo Vidal')
    await join(db, studio.workspaceId, reader)
    await grant(db, { workspaceId: studio.workspaceId, documentId: original, person: reader, role: 'viewer' })

    const response = await duplicate(original, { title: 'My copy' }, reader)

    expect(response.statusCode).toBe(201)
    const copy = bodyAs<Document>(response)
    expect(copy.role).toBe('owner')
    expect((await snapshotOf(copy.id)).document.created_by).toBe(reader.id)
  })

  it('leaves the original exactly as it was: content, revision, timestamps, access and history', async () => {
    const original = await originalWith(stateWith(50))
    const before = await snapshotOf(original)

    await duplicate(original)

    expect(await snapshotOf(original)).toEqual(before)
  })
})

describe('where the copy goes', () => {
  it('is the folder of the original when the request says nothing', async () => {
    const folderId = await createFolder(db, studio.workspaceId)
    const original = await originalWith(stateWith(0), { folderId })

    expect(bodyAs<Document>(await duplicate(original)).folderId).toBe(folderId)
  })

  it('is the folder the request names', async () => {
    const original = await originalWith(stateWith(0), { folderId: await createFolder(db, studio.workspaceId) })
    const other = await createFolder(db, studio.workspaceId, 'Archive')

    expect(bodyAs<Document>(await duplicate(original, { title: 'Copy', folderId: other })).folderId).toBe(other)
  })

  it('is the top level of the workspace when the request says null, even if the original is in a folder', async () => {
    const original = await originalWith(stateWith(0), { folderId: await createFolder(db, studio.workspaceId) })

    expect(bodyAs<Document>(await duplicate(original, { title: 'Copy', folderId: null })).folderId).toBeNull()
  })

  it.each([
    ['a folder that does not exist', () => '3f0c4f6e-6b6e-4a52-9d3a-0d2b8a9e5c11'],
    ['a folder of another workspace', async () => createFolder(db, await createWorkspace(db, 'Almazara'))],
  ])('refuses %s with the field at fault, and creates nothing', async (_name, folder) => {
    const original = await originalWith(stateWith(0))
    const before = await documentsTitled('Copy into nowhere')

    const response = await duplicate(original, { title: 'Copy into nowhere', folderId: await folder() })

    expect(response).toMatchObject({
      statusCode: 400,
      body: { code: 'validation-failed', errors: [{ pointer: '/folderId', code: 'invalid-value' }] },
    })
    expect(await documentsTitled('Copy into nowhere')).toBe(before)
  })
})

describe('the title of the copy, counted in code points', () => {
  it('accepts 200 emoji, which are 400 UTF-16 units', async () => {
    const original = await originalWith(stateWith(0))

    const response = await duplicate(original, { title: '🌊'.repeat(200) })

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Document>(response).title).toBe('🌊'.repeat(200))
  })

  it('refuses 201 with 413 and the pointer, and creates nothing', async () => {
    const original = await originalWith(stateWith(0))

    const response = await duplicate(original, { title: '🌊'.repeat(201) })

    expect(response).toMatchObject({
      statusCode: 413,
      body: { code: 'too-large', errors: [{ pointer: '/title', code: 'too-long' }] },
    })
    expect(await documentsTitled('🌊'.repeat(201))).toBe(0)
  })

  it.each([[{}], [{ title: '' }]])('refuses a request with %j as a 400', async (body) => {
    const original = await originalWith(stateWith(0))

    expect((await duplicate(original, body)).statusCode).toBe(400)
  })
})

describe('what cannot be duplicated', () => {
  it('answers an archived original as a document that is not there, to its owner too', async () => {
    const original = await originalWith(stateWith(0))
    await db.updateTable('documents').set({ archived_at: new Date() }).where('id', '=', original).execute()

    expect(await duplicate(original)).toMatchObject({ statusCode: 404, body: { code: 'not-found' } })
  })

  it('answers 409 when the stored state is not a document of the schema, and creates nothing', async () => {
    const broken = new Y.Doc()
    // A heading of a level the schema does not have: the reader refuses it, as it would any state a hand-made client wrote.
    broken.getXmlFragment(fragmentName).insert(0, [withAttribute(new Y.XmlElement('heading'), 'level', 9)])
    const original = await originalWith(Y.encodeStateAsUpdate(broken))
    const before = await snapshotOf(original)

    const response = await duplicate(original, { title: 'Copy of a broken one' })

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'conflict' } })
    expect(await documentsTitled('Copy of a broken one')).toBe(0)
    expect(await snapshotOf(original)).toEqual(before)
  })

  it('checks the folder before the content: a folder that is not there is a 400 even when the state is unreadable', async () => {
    const broken = new Y.Doc()
    broken.getXmlFragment(fragmentName).insert(0, [withAttribute(new Y.XmlElement('heading'), 'level', 9)])
    const original = await originalWith(Y.encodeStateAsUpdate(broken))
    const foreign = await createFolder(db, await createWorkspace(db, 'Almazara'))

    const response = await duplicate(original, { title: 'Copy into a foreign folder', folderId: foreign })

    expect(response).toMatchObject({ statusCode: 400, body: { code: 'validation-failed' } })
  })

  it('answers a document whose content is gone as a document that is not there, and creates nothing', async () => {
    const original = await originalWith(stateWith(0))
    await db.deleteFrom('document_states').where('document_id', '=', original).execute()

    const response = await duplicate(original, { title: 'Copy of nothing' })

    expect(response).toMatchObject({ statusCode: 404, body: { code: 'not-found' } })
    expect(await documentsTitled('Copy of nothing')).toBe(0)
  })
})

describe('the copy is made from what is stored', () => {
  it('copies the content as it was last stored, not an earlier version of it', async () => {
    const original = await originalWith(stateWith(0))
    const edited = new Y.Doc()
    Y.applyUpdate(edited, await storedState(db, original))
    appendParagraph(edited, 'Added after the first store')
    await storeState(db, original, Y.encodeStateAsUpdate(edited))
    await createVersion(db, {
      workspaceId: studio.workspaceId,
      documentId: original,
      author: studio.owner,
      state: stateWith(0),
    })

    const copy = bodyAs<Document>(await duplicate(original))

    expect(yUpdateToJson(await storedState(db, copy.id)).content?.at(-1)).toMatchObject({
      content: [{ text: 'Added after the first store' }],
    })
  })
})
