import { randomUUID } from 'node:crypto'
import type { Schema } from '@draftroom/contract'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import { sql, type Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeCursor } from '../src/domain/pagination.ts'
import { builtInTemplates } from '../src/domain/templates/built-in.ts'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { whileFolderIsBeingDeleted, whileRowIsLocked } from './support/overlap.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { instantsAgainstIds, setInstants } from './support/stamps.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import {
  createDocument,
  createFolder,
  createPerson,
  createStudio,
  createWorkspace,
  grant,
  join,
  type Person,
  type Studio,
} from './support/world.ts'

type Document = Schema<'Document'>
type Page = Schema<'DocumentPage'>

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

const eventsOf = async (documentId: string): Promise<string[]> =>
  (await db.selectFrom('activity_events').select('type').where('document_id', '=', documentId).execute())
    .map((event) => event.type)
    .sort()

const getDocument = (as: Person, documentId: string) => api({ as, method: 'GET', url: `/api/documents/${documentId}` })

describe('creating a document', () => {
  let studio: Studio
  beforeAll(async () => {
    studio = await createStudio(db)
  })
  const create = (body: object, as = studio.owner) =>
    api({ as, method: 'POST', url: `/api/workspaces/${studio.workspaceId}/documents`, body })

  it('answers 201 with a document owned by its creator and shared with nobody', async () => {
    const response = await create({ title: 'Notas de la reunión de otoño' })

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Document>(response)).toMatchObject({
      workspaceId: studio.workspaceId,
      folderId: null,
      title: 'Notas de la reunión de otoño',
      excerpt: null,
      revision: 1,
      role: 'owner',
      generalAccess: 'none',
      pinned: false,
      createdBy: { id: studio.owner.id, name: studio.owner.name },
      archivedAt: null,
    })
  })

  it('writes the document, its empty content, its creator as owner and the event of its creation', async () => {
    const member = await createPerson(db, 'Daniel Okafor')
    await join(db, studio.workspaceId, member)

    const { id } = bodyAs<Document>(await create({ title: 'Budget' }, member))

    const state = await db
      .selectFrom('document_states')
      .select('state')
      .where('document_id', '=', id)
      .executeTakeFirst()
    const grants = await db
      .selectFrom('document_access')
      .select(['user_id', 'role'])
      .where('document_id', '=', id)
      .execute()
    const events = await db
      .selectFrom('activity_events')
      .select(['type', 'actor_id', 'workspace_id'])
      .where('document_id', '=', id)
      .execute()
    expect([...(state?.state ?? [])]).toEqual([0, 0])
    expect(grants).toEqual([{ user_id: member.id, role: 'owner' }])
    expect(events).toEqual([{ type: 'document.created', actor_id: member.id, workspace_id: studio.workspaceId }])
  })

  it('puts the document in the folder it names', async () => {
    const folderId = await createFolder(db, studio.workspaceId)

    const response = await create({ title: 'Budget', folderId })

    expect(bodyAs<Document>(response).folderId).toBe(folderId)
  })

  it('refuses a template that is not known, together with a folder that is not there', async () => {
    const response = await create({
      title: 'Budget',
      folderId: 'a3d5c7e9-1b2f-4a6c-8d0e-3f5a7c9e1b33',
      templateId: 'no-such-template',
      locale: 'es',
    })

    expect(response.statusCode).toBe(400)
    expect(response.body).toMatchObject({
      code: 'validation-failed',
      errors: [
        { pointer: '/folderId', code: 'invalid-value' },
        { pointer: '/templateId', code: 'invalid-value' },
      ],
    })
  })

  describe('from a template', () => {
    /** The content stored for the document, read the way a client reads it: a fresh `Y.Doc` loaded from the state. */
    const storedContent = async (documentId: string) => {
      const row = await db
        .selectFrom('document_states')
        .select('state')
        .where('document_id', '=', documentId)
        .executeTakeFirstOrThrow()
      const loaded = new Y.Doc()
      Y.applyUpdate(loaded, row.state)
      return yUpdateToJson(Y.encodeStateAsUpdate(loaded))
    }
    const contentOf = (locale: 'en' | 'es', id: string) => {
      const template = builtInTemplates.find(locale, id)
      if (template === undefined) throw new Error(`No template ${id} in ${locale}`)
      return yUpdateToJson(template.state)
    }

    it('stores its content, in the language asked for, as the initial state of the document', async () => {
      const { id } = bodyAs<Document>(await create({ title: 'Reunión', templateId: 'meeting-notes', locale: 'es' }))

      const content = await storedContent(id)
      expect(content).toEqual(contentOf('es', 'meeting-notes'))
      expect(JSON.stringify(content)).toContain('Orden del día')
    })

    it('starts with the first paragraph of the template as its excerpt, as one typed in the editor would, and a blank document with none', async () => {
      const fromTemplate = bodyAs<Document>(await create({ title: 'Update', templateId: 'weekly-update' }))
      const blank = bodyAs<Document>(await create({ title: 'Blank' }))

      expect(fromTemplate.excerpt).toBe('The most important thing that moved forward')
      expect(blank.excerpt).toBeNull()
      const stored = await db
        .selectFrom('documents')
        .select('excerpt')
        .where('id', '=', fromTemplate.id)
        .executeTakeFirstOrThrow()
      expect(stored.excerpt).toBe(fromTemplate.excerpt)
    })

    it('uses English when no language is given', async () => {
      const { id } = bodyAs<Document>(await create({ title: 'Meeting', templateId: 'meeting-notes' }))

      const content = await storedContent(id)
      expect(content).toEqual(contentOf('en', 'meeting-notes'))
      expect(JSON.stringify(content)).toContain('Agenda')
    })
  })

  it('asks for the template when only a language is given', async () => {
    const response = await create({ title: 'Budget', locale: 'es' })

    expect(response.body).toMatchObject({ errors: [{ pointer: '/templateId', code: 'required' }] })
  })
})

describe('creating a document is one transaction', () => {
  it('leaves no document, content or grant behind when its event cannot be written', async () => {
    const isolated = await provisionDatabase()
    const isolatedServer = createTestApp(isolated.db)
    try {
      const studio = await createStudio(isolated.db)
      await sql`create function refuse_events() returns trigger language plpgsql as $$ begin raise exception 'no events today'; end $$`.execute(
        isolated.db,
      )
      await sql`create trigger refuse_events before insert on activity_events for each row execute function refuse_events()`.execute(
        isolated.db,
      )

      const response = await apiOf(isolatedServer)({
        as: studio.owner,
        method: 'POST',
        url: `/api/workspaces/${studio.workspaceId}/documents`,
        body: { title: 'Never stored' },
      })

      expect(response).toMatchObject({ statusCode: 500, body: { code: 'internal-error' } })
      const rows = await Promise.all(
        (['documents', 'document_states', 'document_access'] as const).map((table) =>
          isolated.db.selectFrom(table).selectAll().where('workspace_id', '=', studio.workspaceId).execute(),
        ),
      )
      // The studio's own document is the only one: the failed creation left nothing next to it.
      expect(rows.map((found) => found.length)).toEqual([1, 1, 1])
    } finally {
      await isolatedServer.app.close()
      await isolated.drop()
    }
  })
})

describe('the limits of a title, counted in code points', () => {
  let studio: Studio
  beforeAll(async () => {
    studio = await createStudio(db)
  })
  const create = (title: string) =>
    api({ as: studio.owner, method: 'POST', url: `/api/workspaces/${studio.workspaceId}/documents`, body: { title } })

  it('accepts 200 emoji, which a count of UTF-16 units would call 400', async () => {
    expect((await create('😀'.repeat(200))).statusCode).toBe(201)
  })

  it('refuses 201 emoji with too-large at the title', async () => {
    const response = await create('😀'.repeat(201))

    expect(response).toMatchObject({
      statusCode: 413,
      body: { code: 'too-large', errors: [{ pointer: '/title', code: 'too-long' }] },
    })
  })

  it('refuses an empty title with a plain 400, since it is below the minimum', async () => {
    const response = await create('')

    expect(response).toMatchObject({ statusCode: 400, body: { errors: [{ pointer: '/title', code: 'too-short' }] } })
  })

  it('applies to renaming as well', async () => {
    const rename = (title: string) =>
      api({
        as: studio.owner,
        method: 'PATCH',
        url: `/api/documents/${studio.documentId}`,
        body: { title, revision: 1 },
      })

    expect((await rename('😀'.repeat(201))).statusCode).toBe(413)
    expect((await rename('😀'.repeat(200))).statusCode).toBe(200)
  })
})

describe('changing the title or the folder of a document', () => {
  let studio: Studio
  let editor: Person
  beforeAll(async () => {
    studio = await createStudio(db)
    editor = await createPerson(db, 'Priya Raman')
    await join(db, studio.workspaceId, editor)
  })
  const fresh = () => createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
  const patch = (documentId: string, body: object, as = studio.owner) =>
    api({ as, method: 'PATCH', url: `/api/documents/${documentId}`, body })

  it('renames it, moves the revision on and records the rename', async () => {
    const documentId = await fresh()

    const response = await patch(documentId, { title: 'Autumn launch plan v2', revision: 1 })

    expect(response.statusCode).toBe(200)
    expect(bodyAs<Document>(response)).toMatchObject({ title: 'Autumn launch plan v2', revision: 2 })
    expect(Date.parse(bodyAs<Document>(response).updatedAt)).toBeGreaterThan(
      Date.parse(bodyAs<Document>(response).createdAt),
    )
    expect(await eventsOf(documentId)).toEqual(['document.renamed'])
  })

  it('moves it into a folder and out of it again, recording each move', async () => {
    const documentId = await fresh()
    const folderId = await createFolder(db, studio.workspaceId)

    const into = await patch(documentId, { folderId, revision: 1 })
    const out = await patch(documentId, { folderId: null, revision: 2 })

    expect(bodyAs<Document>(into)).toMatchObject({ folderId, revision: 2 })
    expect(bodyAs<Document>(out)).toMatchObject({ folderId: null, revision: 3 })
    expect(await eventsOf(documentId)).toEqual(['document.moved', 'document.moved'])
  })

  it('records both the rename and the move when one request does both', async () => {
    const documentId = await fresh()
    const folderId = await createFolder(db, studio.workspaceId)

    const response = await patch(documentId, { title: 'Budget', folderId, revision: 1 })

    expect(bodyAs<Document>(response).revision).toBe(2)
    expect(await eventsOf(documentId)).toEqual(['document.moved', 'document.renamed'])
  })

  it('changes nothing, and records nothing, when the values sent are the ones it has', async () => {
    const documentId = await fresh()

    const response = await patch(documentId, { title: 'Autumn launch plan', folderId: null, revision: 1 })

    expect(bodyAs<Document>(response)).toMatchObject({ revision: 1, title: 'Autumn launch plan' })
    expect(await eventsOf(documentId)).toEqual([])
  })

  it('needs something to change besides the revision', async () => {
    const response = await patch(await fresh(), { revision: 1 })

    expect(response.statusCode).toBe(400)
  })

  describe('with a revision that is no longer the document’s', () => {
    it('answers 409 with the document as it is now, so the caller can reconcile', async () => {
      const documentId = await fresh()
      await patch(documentId, { title: 'Changed by someone else', revision: 1 })

      const stale = await patch(documentId, { title: 'My change', revision: 1 })

      expect(stale.statusCode).toBe(409)
      expect(stale.body).toMatchObject({ code: 'revision-conflict', status: 409 })
      expect(bodyAs<{ current: Document }>(stale).current).toEqual((await getDocument(studio.owner, documentId)).body)
      expect(bodyAs<{ current: Document }>(stale).current).toMatchObject({
        title: 'Changed by someone else',
        revision: 2,
      })
    })

    it('shows the current document only as much as the caller may know it: no sharing settings for an editor', async () => {
      const documentId = await createDocument(db, {
        workspaceId: studio.workspaceId,
        creator: studio.owner,
        generalAccess: 'editor',
      })
      await patch(documentId, { title: 'Changed by someone else', revision: 1 })

      const stale = await patch(documentId, { title: 'My change', revision: 1 }, editor)

      expect(stale.statusCode).toBe(409)
      expect(bodyAs<{ current: Document }>(stale).current).toMatchObject({ role: 'editor', generalAccess: null })
    })

    it('lets exactly one of two changes made at the same time win', async () => {
      const documentId = await fresh()

      // Both are held at the write by a lock on the row, so both have read revision 1 when the lock is let go.
      const answers = await whileRowIsLocked(db, { table: 'documents', id: documentId }, () => [
        patch(documentId, { title: 'First', revision: 1 }),
        patch(documentId, { title: 'Second', revision: 1 }),
      ])

      expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 409])
      const stored = await db
        .selectFrom('documents')
        .select(['title', 'revision'])
        .where('id', '=', documentId)
        .executeTakeFirstOrThrow()
      expect(stored.revision).toBe(2)
      expect(['First', 'Second']).toContain(stored.title)
      // The one that lost is told what won, as the server holds it.
      const lost = answers.find((answer) => answer.statusCode === 409)
      expect(lost?.body).toMatchObject({ current: { id: documentId, title: stored.title, revision: stored.revision } })
    })
  })
})

describe('a folder deleted while a document is written into it', () => {
  let studio: Studio
  beforeAll(async () => {
    studio = await createStudio(db)
  })
  const folderGone = { errors: [{ pointer: '/folderId', code: 'invalid-value' }] }

  it('answers creating a document there as it answers a folder that is not there, and creates nothing', async () => {
    const folderId = await createFolder(db, studio.workspaceId)

    const [response] = await whileFolderIsBeingDeleted(db, folderId, () => [
      api({
        as: studio.owner,
        method: 'POST',
        url: `/api/workspaces/${studio.workspaceId}/documents`,
        body: { title: 'Written into a folder that goes away', folderId },
      }),
    ])

    expect(response).toMatchObject({ statusCode: 400, body: { code: 'validation-failed', ...folderGone } })
    const created = await db
      .selectFrom('documents')
      .select('id')
      .where('title', '=', 'Written into a folder that goes away')
      .execute()
    expect(created).toEqual([])
  })

  it('answers moving a document there the same way, and leaves the document where it was', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
    const folderId = await createFolder(db, studio.workspaceId)

    const [response] = await whileFolderIsBeingDeleted(db, folderId, () => [
      api({ as: studio.owner, method: 'PATCH', url: `/api/documents/${documentId}`, body: { folderId, revision: 1 } }),
    ])

    expect(response).toMatchObject({ statusCode: 400, body: { code: 'validation-failed', ...folderGone } })
    const stored = await db
      .selectFrom('documents')
      .select(['folder_id', 'revision'])
      .where('id', '=', documentId)
      .executeTakeFirstOrThrow()
    expect(stored).toEqual({ folder_id: null, revision: 1 })
  })
})

describe('archiving, restoring and deleting', () => {
  let studio: Studio
  beforeAll(async () => {
    studio = await createStudio(db)
  })
  const fresh = () => createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
  const call = (method: 'POST' | 'DELETE', url: string) => api({ as: studio.owner, method, url })

  it('archives a document, moves its revision on and records it', async () => {
    const documentId = await fresh()

    const response = await call('POST', `/api/documents/${documentId}/archive`)

    expect(bodyAs<Document>(response)).toMatchObject({ revision: 2, archivedAt: expect.any(String) })
    expect(await eventsOf(documentId)).toEqual(['document.archived'])
  })

  it('answers archiving an archived document with the document as it is: nothing changed, nothing recorded', async () => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })

    const response = await call('POST', `/api/documents/${documentId}/archive`)

    expect(response.statusCode).toBe(200)
    expect(bodyAs<Document>(response)).toMatchObject({ revision: 1, archivedAt: expect.any(String) })
    expect(await eventsOf(documentId)).toEqual([])
  })

  it('restores an archived document, moves its revision on and records it', async () => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })

    const response = await call('POST', `/api/documents/${documentId}/restore`)

    expect(bodyAs<Document>(response)).toMatchObject({ revision: 2, archivedAt: null })
    expect(await eventsOf(documentId)).toEqual(['document.restored'])
  })

  it('answers restoring a document that is not archived with the document as it is: nothing changed, nothing recorded', async () => {
    const documentId = await fresh()

    const response = await call('POST', `/api/documents/${documentId}/restore`)

    expect(bodyAs<Document>(response)).toMatchObject({ revision: 1, archivedAt: null })
    expect(await eventsOf(documentId)).toEqual([])
  })

  it('refuses to delete a document that is not archived, and keeps it', async () => {
    const documentId = await fresh()

    const response = await call('DELETE', `/api/documents/${documentId}`)

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'conflict' } })
    expect((await getDocument(studio.owner, documentId)).statusCode).toBe(200)
  })

  it('deletes an archived document for good, with its content, grants, pins and history', async () => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })
    await db
      .insertInto('pins')
      .values({ workspace_id: studio.workspaceId, document_id: documentId, user_id: studio.owner.id })
      .execute()
    await db
      .insertInto('activity_events')
      .values({
        workspace_id: studio.workspaceId,
        document_id: documentId,
        type: 'document.archived',
        actor_id: studio.owner.id,
      })
      .execute()

    const response = await call('DELETE', `/api/documents/${documentId}`)

    expect(response.statusCode).toBe(204)
    expect((await getDocument(studio.owner, documentId)).statusCode).toBe(404)
    const left = await Promise.all(
      (['documents', 'document_states', 'document_access', 'pins', 'activity_events'] as const).map((table) =>
        db
          .selectFrom(table)
          .selectAll()
          .where(table === 'documents' ? 'id' : 'document_id', '=', documentId)
          .execute(),
      ),
    )
    expect(left.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('pages of documents', () => {
  /** A workspace of its own, so the pages hold only what the test put there. */
  async function workspaceWithOwner(): Promise<{ workspaceId: string; owner: Person }> {
    const workspaceId = await createWorkspace(db)
    const owner = await createPerson(db, 'Marta Ruiz')
    await join(db, workspaceId, owner, 'owner')
    return { workspaceId, owner }
  }
  const list = (as: Person, workspaceId: string, query: string) =>
    api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}/documents${query}` })

  /** Reads every page with the given size, and says how many pages it took. */
  async function readAll(
    as: Person,
    workspaceId: string,
    limit: number,
    extra = '',
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const response = await list(
        as,
        workspaceId,
        `?limit=${limit}${extra}${cursor === null ? '' : `&cursor=${cursor}`}`,
      )
      const page = bodyAs<Page>(response)
      ids.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
      pages += 1
    } while (cursor !== null)
    return { ids, pages }
  }

  it('walks the whole list in pages, newest change first, and ends with a null cursor', async () => {
    const { workspaceId, owner } = await workspaceWithOwner()
    const created = []
    for (const day of [1, 2, 3, 4, 5]) {
      created.push(await createDocument(db, { workspaceId, creator: owner, updatedAt: `2026-10-0${day}T10:00:00Z` }))
    }

    const { ids, pages } = await readAll(owner, workspaceId, 2)

    expect(ids).toEqual([...created].reverse())
    expect(pages).toBe(3)
  })

  it('keeps a stable order, with no document twice or missing, when many share the same timestamp', async () => {
    const { workspaceId, owner } = await workspaceWithOwner()
    const created = []
    for (let index = 0; index < 7; index += 1) {
      created.push(await createDocument(db, { workspaceId, creator: owner, updatedAt: '2026-10-13T15:30:00Z' }))
    }

    const { ids } = await readAll(owner, workspaceId, 3)

    expect(ids).toEqual([...created].sort().reverse())
  })

  it('orders by the millisecond and then by id, not by the microseconds, and does not skip or repeat any when paged one at a time', async () => {
    const { workspaceId, owner } = await workspaceWithOwner()
    const create = async (count: number, millisecond: number) => {
      const ids: string[] = []
      for (let index = 0; index < count; index += 1) ids.push(await createDocument(db, { workspaceId, creator: owner }))
      await setInstants(db, 'documents', 'updated_at', instantsAgainstIds(ids, millisecond))
      return ids
    }
    const earlier = await create(3, 0)
    const later = await create(3, 1)

    const { ids } = await readAll(owner, workspaceId, 1)

    // The 999 µs mark of the earlier millisecond is still in it: an instant that is cut and not rounded.
    expect(ids).toEqual([...later.sort().reverse(), ...earlier.sort().reverse()])
  })

  it('serves the instants the order is made of, the millisecond the API writes', async () => {
    const { workspaceId, owner } = await workspaceWithOwner()
    const id = await createDocument(db, { workspaceId, creator: owner })
    await setInstants(db, 'documents', 'updated_at', instantsAgainstIds([id], 7))

    const [document] = bodyAs<Page>(await list(owner, workspaceId, '')).items

    expect(document?.updatedAt).toBe('2026-10-13T16:00:00.007Z')
  })

  it('gives each page at most the limit, and the default of 25 when none is asked', async () => {
    const { workspaceId, owner } = await workspaceWithOwner()
    for (let index = 0; index < 26; index += 1) await createDocument(db, { workspaceId, creator: owner })

    const page = bodyAs<Page>(await list(owner, workspaceId, ''))

    expect(page.items).toHaveLength(25)
    expect(page.nextCursor).not.toBeNull()
  })

  it.each([['0'], ['101'], ['abc']])('refuses a limit of %s', async (limit) => {
    const { workspaceId, owner } = await workspaceWithOwner()

    const response = await list(owner, workspaceId, `?limit=${limit}`)

    expect(response).toMatchObject({ statusCode: 400, body: { errors: [{ pointer: '/query/limit' }] } })
  })

  describe('a cursor', () => {
    let first: { workspaceId: string; owner: Person; cursor: string }
    beforeAll(async () => {
      const { workspaceId, owner } = await workspaceWithOwner()
      for (const title of ['Launch plan', 'Launch budget', 'Launch notes']) {
        await createDocument(db, { workspaceId, creator: owner, title })
      }
      const page = bodyAs<Page>(await list(owner, workspaceId, '?query=launch&limit=1'))
      first = { workspaceId, owner, cursor: page.nextCursor ?? '' }
    })

    it('goes on from where the page ended, for the same filters', async () => {
      const response = await list(first.owner, first.workspaceId, `?query=launch&limit=1&cursor=${first.cursor}`)

      expect(response.statusCode).toBe(200)
    })

    it.each([
      ['another search', '?query=budget'],
      ['no search', ''],
      ['the archive', '?query=launch&archived=true'],
    ])('is refused with %s: it belongs to the list it came from', async (_name, filters) => {
      const joiner = filters === '' ? '?' : '&'
      const response = await list(first.owner, first.workspaceId, `${filters}${joiner}cursor=${first.cursor}`)

      expect(response).toMatchObject({
        statusCode: 400,
        body: { code: 'validation-failed', errors: [{ pointer: '/query/cursor', code: 'invalid-value' }] },
      })
    })

    it('is refused when it names a year that does not exist, as invalid and not as a failure of the server', async () => {
      const filters = { workspaceId: first.workspaceId, query: null, folderId: null, archived: false }
      const cursor = encodeCursor({ timestamp: '0000-06-01T00:00:00.000000Z', id: randomUUID() }, filters)

      const response = await list(first.owner, first.workspaceId, `?cursor=${cursor}`)

      expect(response).toMatchObject({
        statusCode: 400,
        body: { code: 'validation-failed', errors: [{ pointer: '/query/cursor', code: 'invalid-value' }] },
      })
    })

    it('is refused in another workspace, though the person belongs to both', async () => {
      const other = await workspaceWithOwner()
      await join(db, other.workspaceId, first.owner)

      const response = await list(first.owner, other.workspaceId, `?query=launch&limit=1&cursor=${first.cursor}`)

      expect(response.statusCode).toBe(400)
    })

    it('is refused when it is not one, and that is told to someone outside the workspace as well, since it says nothing of it', async () => {
      const outsider = await createPerson(db, 'Camila Ortega')

      const asMember = await list(first.owner, first.workspaceId, '?cursor=not-a-cursor')
      const asOutsider = await list(outsider, first.workspaceId, '?cursor=not-a-cursor')

      expect(asMember.statusCode).toBe(400)
      expect(asOutsider).toMatchObject({ statusCode: 400, body: asMember.body })
    })
  })
})

describe('pins and the documents shared with a person', () => {
  let studio: Studio
  let carol: Person
  beforeAll(async () => {
    studio = await createStudio(db)
    carol = await createPerson(db, 'Carol Nwosu')
    await join(db, studio.workspaceId, carol)
  })
  const ids = async (as: Person, path: string): Promise<string[]> =>
    bodyAs<Schema<'DocumentList'>>(
      await api({ as, method: 'GET', url: `/api/workspaces/${studio.workspaceId}/${path}` }),
    ).items.map((item) => item.id)

  it('pins and unpins for the caller alone, and both can be repeated', async () => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      generalAccess: 'viewer',
    })
    const pin = (as: Person, method: 'PUT' | 'DELETE') => api({ as, method, url: `/api/documents/${documentId}/pin` })

    expect([(await pin(carol, 'PUT')).statusCode, (await pin(carol, 'PUT')).statusCode]).toEqual([204, 204])
    expect(bodyAs<Document>(await getDocument(carol, documentId)).pinned).toBe(true)
    expect(bodyAs<Document>(await getDocument(studio.owner, documentId)).pinned).toBe(false)
    expect(await ids(carol, 'pinned')).toContain(documentId)
    expect(await ids(studio.owner, 'pinned')).not.toContain(documentId)

    expect([(await pin(carol, 'DELETE')).statusCode, (await pin(carol, 'DELETE')).statusCode]).toEqual([204, 204])
    expect(bodyAs<Document>(await getDocument(carol, documentId)).pinned).toBe(false)
  })

  it('stops listing a pinned document the person can no longer read, and brings it back with the access', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
    await grant(db, { workspaceId: studio.workspaceId, documentId, person: carol, role: 'viewer' })
    await api({ as: carol, method: 'PUT', url: `/api/documents/${documentId}/pin` })
    expect(await ids(carol, 'pinned')).toContain(documentId)

    await db
      .deleteFrom('document_access')
      .where('document_id', '=', documentId)
      .where('user_id', '=', carol.id)
      .execute()
    expect(await ids(carol, 'pinned')).not.toContain(documentId)

    await grant(db, { workspaceId: studio.workspaceId, documentId, person: carol, role: 'commenter' })
    expect(await ids(carol, 'pinned')).toContain(documentId)
  })

  describe('the shared list', () => {
    // A workspace of its own: the pins above gave Carol access to documents of the other one.
    let own: Studio
    let reader: Person
    let shared: { edit: string; view: string; own: string; none: string; raised: string }
    const sharedIds = async (as: Person, path = 'shared'): Promise<string[]> =>
      bodyAs<Schema<'DocumentList'>>(
        await api({ as, method: 'GET', url: `/api/workspaces/${own.workspaceId}/${path}` }),
      ).items.map((item) => item.id)

    beforeAll(async () => {
      own = await createStudio(db)
      reader = await createPerson(db, 'Carol Nwosu')
      await join(db, own.workspaceId, reader)
      const workspaceId = own.workspaceId
      const make = (title: string, generalAccess: 'none' | 'viewer' | 'editor' = 'none') =>
        createDocument(db, { workspaceId, creator: own.owner, title, generalAccess })
      shared = {
        edit: await make('Edit by grant'),
        view: await make('View by general access', 'viewer'),
        own: await createDocument(db, { workspaceId, creator: reader, title: 'Her own' }),
        none: await make('Private'),
        raised: await make('Viewer grant raised by general access', 'editor'),
      }
      await grant(db, { workspaceId, documentId: shared.edit, person: reader, role: 'editor' })
      await grant(db, { workspaceId, documentId: shared.raised, person: reader, role: 'viewer' })
    })

    it('holds what the person can read and does not own, and nothing else', async () => {
      expect((await sharedIds(reader)).sort()).toEqual([shared.edit, shared.view, shared.raised].sort())
    })

    it.each([
      ['edit', ['edit', 'raised']],
      ['view', ['view']],
      ['comment', []],
    ] as const)('keeps, for access=%s, the documents on which the person’s role is that one', async (access, keys) => {
      expect((await sharedIds(reader, `shared?access=${access}`)).sort()).toEqual(keys.map((key) => shared[key]).sort())
    })

    it('is empty for an owner of the workspace, who owns every document', async () => {
      expect(await sharedIds(own.owner)).toEqual([])
    })
  })
})
