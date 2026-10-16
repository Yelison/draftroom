import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteArchivedDocument, setArchived, updateMetadata } from '../src/db/documents/commands.ts'
import { renameFolder } from '../src/db/folders.ts'
import type { Database } from '../src/db/tables.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createDocument, createFolder, createStudio, type Studio } from './support/world.ts'

// The guards of the writes, which the routes also check first. The routes' own check can only be told apart from the
// statement's here: two requests that really overlap are too fast to arrange, and these are the statements that decide
// which of them wins.

let database: TestDatabase
let db: Kysely<Database>
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
})
afterAll(async () => {
  await database.drop()
})

const eventsOf = async (documentId: string): Promise<string[]> =>
  (await db.selectFrom('activity_events').select('type').where('document_id', '=', documentId).execute()).map(
    (event) => event.type,
  )

const stateOf = (documentId: string) =>
  db
    .selectFrom('documents')
    .select(['title', 'revision', 'archived_at'])
    .where('id', '=', documentId)
    .executeTakeFirstOrThrow()

describe('writing the metadata of a document', () => {
  const update = (documentId: string, revision: number) =>
    db.transaction().execute((trx) =>
      updateMetadata(trx, {
        documentId,
        workspaceId: studio.workspaceId,
        actorId: studio.owner.id,
        revision,
        title: 'Renamed',
        events: ['document.renamed'],
      }),
    )

  it('happens when the document still has the revision that was read', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })

    expect(await update(documentId, 1)).toBe(true)
    expect(await stateOf(documentId)).toMatchObject({ title: 'Renamed', revision: 2 })
    expect(await eventsOf(documentId)).toEqual(['document.renamed'])
  })

  it('does not happen, and leaves no event, when someone else got there first', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
    await update(documentId, 1)

    expect(await update(documentId, 1)).toBe(false)
    expect(await stateOf(documentId)).toMatchObject({ revision: 2 })
    expect(await eventsOf(documentId)).toEqual(['document.renamed'])
  })
})

describe('archiving and restoring a document', () => {
  const change = (documentId: string, archive: boolean) =>
    db
      .transaction()
      .execute((trx) =>
        setArchived(trx, { documentId, workspaceId: studio.workspaceId, actorId: studio.owner.id, archive }),
      )

  it('changes a document that is in the other state, and records it', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })

    expect(await change(documentId, true)).toBe(true)
    expect(await change(documentId, false)).toBe(true)
    expect(await eventsOf(documentId)).toEqual(['document.archived', 'document.restored'])
    expect(await stateOf(documentId)).toMatchObject({ revision: 3, archived_at: null })
  })

  it.each([
    ['archiving an archived document', true, true],
    ['restoring a live document', false, false],
  ])('leaves %s as it is: no revision, no event', async (_name, archive, archived) => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner, archived })

    expect(await change(documentId, archive)).toBe(false)
    expect(await stateOf(documentId)).toMatchObject({ revision: 1 })
    expect(await eventsOf(documentId)).toEqual([])
  })
})

describe('deleting a document for good', () => {
  it('deletes one that is archived', async () => {
    const documentId = await createDocument(db, {
      workspaceId: studio.workspaceId,
      creator: studio.owner,
      archived: true,
    })

    expect(await deleteArchivedDocument(db, documentId)).toBe(true)
  })

  it('does not delete one that was restored in the meantime', async () => {
    const documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })

    expect(await deleteArchivedDocument(db, documentId)).toBe(false)
    expect(await stateOf(documentId)).toMatchObject({ revision: 1 })
  })
})

describe('renaming a folder', () => {
  it('happens when the folder still has the revision that was read, and not when someone else got there first', async () => {
    const folderId = await createFolder(db, studio.workspaceId)

    expect(await renameFolder(db, folderId, 'First', 1)).toMatchObject({ name: 'First', revision: 2 })
    expect(await renameFolder(db, folderId, 'Second', 1)).toBeUndefined()
    expect(await db.selectFrom('folders').select('name').where('id', '=', folderId).executeTakeFirstOrThrow()).toEqual({
      name: 'First',
    })
  })
})
