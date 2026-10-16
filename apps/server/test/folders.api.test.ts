import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { whileRowIsLocked } from './support/overlap.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createFolder, createPerson, createWorkspace, join, type Person } from './support/world.ts'

type Folder = Schema<'Folder'>

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let workspaceId: string
let owner: Person
let member: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  member = await createPerson(db, 'Daniel Okafor')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, member)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

describe('listing and creating folders', () => {
  it('lists the folders of a workspace by name, then by id', async () => {
    const own = await createWorkspace(db)
    await join(db, own, owner, 'owner')
    for (const name of ['Press', 'Budget', 'Launch']) await createFolder(db, own, name)

    const response = await api({ as: owner, method: 'GET', url: `/api/workspaces/${own}/folders` })

    expect(bodyAs<Schema<'FolderList'>>(response).items.map((folder) => folder.name)).toEqual([
      'Budget',
      'Launch',
      'Press',
    ])
  })

  it('lets any member create one, and starts it at revision 1', async () => {
    const response = await api({
      as: member,
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/folders`,
      body: { name: 'Budget' },
    })

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Folder>(response)).toMatchObject({ workspaceId, name: 'Budget', revision: 1 })
  })

  it('counts a name in code points: 80 emoji fit, 81 are too large, an empty one is invalid', async () => {
    const create = (name: string) =>
      api({ as: owner, method: 'POST', url: `/api/workspaces/${workspaceId}/folders`, body: { name } })

    expect((await create('😀'.repeat(80))).statusCode).toBe(201)
    expect(await create('😀'.repeat(81))).toMatchObject({
      statusCode: 413,
      body: { code: 'too-large', errors: [{ pointer: '/name', code: 'too-long' }] },
    })
    expect(await create('')).toMatchObject({
      statusCode: 400,
      body: { errors: [{ pointer: '/name', code: 'too-short' }] },
    })
  })
})

describe('renaming a folder', () => {
  const rename = (folderId: string, body: object, as = member) =>
    api({ as, method: 'PATCH', url: `/api/folders/${folderId}`, body })

  it('lets any member do it, and moves the revision and the update time on', async () => {
    const folderId = await createFolder(db, workspaceId, 'Launch')
    const before = await db
      .selectFrom('folders')
      .select('updated_at')
      .where('id', '=', folderId)
      .executeTakeFirstOrThrow()

    const response = await rename(folderId, { name: 'Launch 2026', revision: 1 })

    expect(response.statusCode).toBe(200)
    expect(bodyAs<Folder>(response)).toMatchObject({ name: 'Launch 2026', revision: 2 })
    expect(Date.parse(bodyAs<Folder>(response).updatedAt)).toBeGreaterThan(before.updated_at.getTime())
  })

  it('answers 409 with the folder as it is now when the revision is stale', async () => {
    const folderId = await createFolder(db, workspaceId, 'Launch')
    await rename(folderId, { name: 'Renamed by someone else', revision: 1 })

    const stale = await rename(folderId, { name: 'My name', revision: 1 })

    expect(stale.statusCode).toBe(409)
    expect(stale.body).toMatchObject({
      code: 'revision-conflict',
      current: { id: folderId, name: 'Renamed by someone else', revision: 2 },
    })
  })

  it('lets exactly one of two renames made at the same time win', async () => {
    const folderId = await createFolder(db, workspaceId, 'Launch')

    // Both are held at the write by a lock on the row, so both have read revision 1 when the lock is let go.
    const answers = await whileRowIsLocked(db, { table: 'folders', id: folderId }, () => [
      rename(folderId, { name: 'First', revision: 1 }),
      rename(folderId, { name: 'Second', revision: 1 }),
    ])

    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 409])
  })
})

describe('deleting a folder', () => {
  const remove = (folderId: string, as: Person) => api({ as, method: 'DELETE', url: `/api/folders/${folderId}` })

  it('is for the owners of the workspace: a member is refused, and the folder stays', async () => {
    const folderId = await createFolder(db, workspaceId)

    expect((await remove(folderId, member)).statusCode).toBe(403)
    expect((await remove(folderId, owner)).statusCode).toBe(204)
    expect(await db.selectFrom('folders').select('id').where('id', '=', folderId).execute()).toEqual([])
  })

  it.each([
    ['a live document', false],
    ['an archived document', true],
  ])('is refused with 409 while it holds %s', async (_name, archived) => {
    const folderId = await createFolder(db, workspaceId)
    await createDocument(db, { workspaceId, creator: owner, folderId, archived })

    const response = await remove(folderId, owner)

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'conflict' } })
    expect(await db.selectFrom('folders').select('id').where('id', '=', folderId).execute()).toHaveLength(1)
  })
})
