import { randomUUID } from 'node:crypto'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, DocumentRole, WorkspaceRole } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import {
  createDocument,
  createPendingPerson,
  createPerson,
  createWorkspace,
  grant,
  join,
  type Person,
} from './support/world.ts'

// The rules of changing who can open a document and who belongs to a workspace: what each change leaves in the
// history, the owner that is always kept, the 404 of a grant that is not there, and what a removed member leaves behind.
// Who may ask at all is the matrix (`access-matrix.test.ts`); this is what follows once they may.

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
  readonly workspaceId: string
  /** Owns the workspace and made the documents. */
  readonly owner: Person
}

/** A workspace of its own, so that what a test does to its members is not seen by the next one. */
async function newWorkspace(): Promise<Setting> {
  const workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
  return { workspaceId, owner }
}

async function member(workspaceId: string, name: string, role: WorkspaceRole = 'member'): Promise<Person> {
  const person = await createPerson(db, name)
  await join(db, workspaceId, person, role)
  return person
}

async function documentFor(setting: Setting, creator: Person = setting.owner): Promise<string> {
  return createDocument(db, { workspaceId: setting.workspaceId, creator })
}

const grantsOf = async (documentId: string): Promise<Record<string, DocumentRole>> =>
  Object.fromEntries(
    (
      await db.selectFrom('document_access').select(['user_id', 'role']).where('document_id', '=', documentId).execute()
    ).map((row) => [row.user_id, row.role]),
  )

/** What the history holds of access changes on a document, oldest first. */
async function accessEvents(documentId: string) {
  const rows = await db
    .selectFrom('activity_events')
    .select(['type', 'actor_id', 'target_user_id'])
    .where('document_id', '=', documentId)
    .where('type', 'in', ['access.granted', 'access.changed', 'access.revoked', 'general-access.changed'])
    .orderBy('created_at')
    .execute()
  return rows.map((row) => ({ type: row.type, actor: row.actor_id, target: row.target_user_id }))
}

const putAccess = (as: Person, documentId: string, userId: string, role: DocumentRole) =>
  api({ as, method: 'PUT', url: `/api/documents/${documentId}/access/${userId}`, body: { role } })
const deleteAccess = (as: Person, documentId: string, userId: string) =>
  api({ as, method: 'DELETE', url: `/api/documents/${documentId}/access/${userId}` })
const putGeneral = (as: Person, documentId: string, generalAccess: string) =>
  api({ as, method: 'PUT', url: `/api/documents/${documentId}/general-access`, body: { generalAccess } })

describe('listing who can open a document', () => {
  it('holds the explicit grants, the creator and pending members included, and the general access', async () => {
    const setting = await newWorkspace()
    const creator = await member(setting.workspaceId, 'Eli Vega')
    const pending = await createPendingPerson(db)
    await join(db, setting.workspaceId, pending)
    const documentId = await documentFor(setting, creator)
    await grant(db, { workspaceId: setting.workspaceId, documentId, person: { ...pending, name: 'x' }, role: 'viewer' })
    await db.updateTable('documents').set({ general_access: 'commenter' }).where('id', '=', documentId).execute()

    const response = await api({ as: creator, method: 'GET', url: `/api/documents/${documentId}/access` })

    // The creator holds the `owner` grant, and the workspace owner, who is only an implicit owner, is not listed.
    expect(bodyAs<Schema<'AccessList'>>(response)).toMatchObject({
      generalAccess: 'commenter',
      items: [
        { userId: creator.id, role: 'owner', name: 'Eli Vega' },
        { userId: pending.id, role: 'viewer', name: null, email: pending.email },
      ],
    })
  })
})

describe('granting and changing a role', () => {
  it('records who gave what to whom: a grant, then a change, and nothing for a change that changes nothing', async () => {
    const setting = await newWorkspace()
    const colleague = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)

    const granted = await putAccess(setting.owner, documentId, colleague.id, 'viewer')
    const again = await putAccess(setting.owner, documentId, colleague.id, 'viewer')
    const changed = await putAccess(setting.owner, documentId, colleague.id, 'editor')

    expect([granted.statusCode, again.statusCode, changed.statusCode]).toEqual([200, 200, 200])
    expect(bodyAs<Schema<'AccessEntry'>>(changed)).toMatchObject({ userId: colleague.id, role: 'editor' })
    expect(await grantsOf(documentId)).toMatchObject({ [colleague.id]: 'editor' })
    expect(await accessEvents(documentId)).toEqual([
      { type: 'access.granted', actor: setting.owner.id, target: colleague.id },
      { type: 'access.changed', actor: setting.owner.id, target: colleague.id },
    ])
  })

  it('gives a role to a member who has not signed up yet', async () => {
    const setting = await newWorkspace()
    const pending = await createPendingPerson(db)
    await join(db, setting.workspaceId, pending)
    const documentId = await documentFor(setting)

    const response = await putAccess(setting.owner, documentId, pending.id, 'commenter')

    expect(bodyAs<Schema<'AccessEntry'>>(response)).toMatchObject({ userId: pending.id, name: null, role: 'commenter' })
  })

  it.each([
    ['somebody outside the workspace', async () => (await createPerson(db, 'Zoe Hartmann')).id],
    ['somebody who does not exist', async () => randomUUID()],
  ])('answers 404 for %s, and writes nothing', async (_who, target) => {
    const setting = await newWorkspace()
    const documentId = await documentFor(setting)
    const before = await grantsOf(documentId)

    const response = await putAccess(setting.owner, documentId, await target(), 'editor')

    expect(response.statusCode).toBe(404)
    expect(await grantsOf(documentId)).toEqual(before)
    expect(await accessEvents(documentId)).toEqual([])
  })
})

describe('the last explicit owner of a document', () => {
  it('cannot be lowered, and can once somebody else is an owner too', async () => {
    const setting = await newWorkspace()
    const colleague = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)

    const refused = await putAccess(setting.owner, documentId, setting.owner.id, 'editor')
    await putAccess(setting.owner, documentId, colleague.id, 'owner')
    const allowed = await putAccess(setting.owner, documentId, setting.owner.id, 'editor')

    expect(refused).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
    expect(allowed.statusCode).toBe(200)
    expect(await grantsOf(documentId)).toEqual({ [setting.owner.id]: 'editor', [colleague.id]: 'owner' })
  })

  it('cannot lose the grant either, and the workspace owner, an implicit owner, does not count as the one who is kept', async () => {
    const setting = await newWorkspace()
    const creator = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting, creator)

    const refused = await deleteAccess(setting.owner, documentId, creator.id)

    expect(refused).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
    expect(await grantsOf(documentId)).toEqual({ [creator.id]: 'owner' })
  })

  it('is not saved by an owner who has not signed up: the one who can act is the one that is kept', async () => {
    const setting = await newWorkspace()
    const pending = await createPendingPerson(db)
    await join(db, setting.workspaceId, pending)
    const documentId = await documentFor(setting)
    await putAccess(setting.owner, documentId, pending.id, 'owner')

    const refused = await putAccess(setting.owner, documentId, setting.owner.id, 'viewer')

    expect(refused).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
  })
})

describe('removing a grant', () => {
  it('records it, leaves the person what the general access gives them, and is not repeated for a second time', async () => {
    const setting = await newWorkspace()
    const colleague = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)
    await putAccess(setting.owner, documentId, colleague.id, 'editor')
    await putGeneral(setting.owner, documentId, 'viewer')

    const removed = await deleteAccess(setting.owner, documentId, colleague.id)
    const again = await deleteAccess(setting.owner, documentId, colleague.id)
    const reads = await api({ as: colleague, method: 'GET', url: `/api/documents/${documentId}` })

    expect(removed.statusCode).toBe(204)
    // Not idempotent: the grant is not there, so the second answer is not the first.
    expect(again).toMatchObject({ statusCode: 404, body: { code: 'not-found' } })
    expect(bodyAs<Schema<'Document'>>(reads).role).toBe('viewer')
    expect((await accessEvents(documentId)).map(({ type }) => type)).toEqual([
      'access.granted',
      'general-access.changed',
      'access.revoked',
    ])
  })

  it('answers 404 for somebody who never had one', async () => {
    const setting = await newWorkspace()
    const colleague = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)

    const response = await deleteAccess(setting.owner, documentId, colleague.id)

    expect(response).toMatchObject({ statusCode: 404, body: { code: 'not-found' } })
  })
})

describe('the general access', () => {
  it('is changed and recorded, and a change to the same value records nothing', async () => {
    const setting = await newWorkspace()
    const documentId = await documentFor(setting)

    const first = await putGeneral(setting.owner, documentId, 'commenter')
    const same = await putGeneral(setting.owner, documentId, 'commenter')

    expect([first, same].map(({ statusCode, body }) => [statusCode, body])).toEqual([
      [200, { generalAccess: 'commenter' }],
      [200, { generalAccess: 'commenter' }],
    ])
    expect(await accessEvents(documentId)).toEqual([
      { type: 'general-access.changed', actor: setting.owner.id, target: null },
    ])
  })

  it('is shown to the owners of the document and to nobody else, the same as the list of the access', async () => {
    const setting = await newWorkspace()
    const reader = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)
    await putAccess(setting.owner, documentId, reader.id, 'viewer')
    await putGeneral(setting.owner, documentId, 'commenter')

    const asOwner = await api({ as: setting.owner, method: 'GET', url: `/api/documents/${documentId}` })
    const asReader = await api({ as: reader, method: 'GET', url: `/api/documents/${documentId}` })

    expect(bodyAs<Schema<'Document'>>(asOwner).generalAccess).toBe('commenter')
    expect(bodyAs<Schema<'Document'>>(asReader)).toMatchObject({ role: 'commenter', generalAccess: null })
  })
})

const members = (workspaceId: string, as: Person) =>
  api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}/members` })

describe('adding a member', () => {
  it('creates a pending member for an address nobody has used, and answers it with an id already', async () => {
    const setting = await newWorkspace()

    const response = await api({
      as: setting.owner,
      method: 'POST',
      url: `/api/workspaces/${setting.workspaceId}/members`,
      body: { email: 'Lucia@Harborpine.example', role: 'member' },
    })

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Schema<'Member'>>(response)).toMatchObject({
      email: 'Lucia@Harborpine.example',
      name: null,
      role: 'member',
      status: 'pending',
    })
    const listed = bodyAs<Schema<'MemberList'>>(await members(setting.workspaceId, setting.owner))
    expect(listed.items.map(({ status }) => status)).toEqual(['active', 'pending'])
  })

  it('adds a person who has an account as they are: active, with their name', async () => {
    const setting = await newWorkspace()
    const known = await createPerson(db, 'Eli Vega')

    const response = await api({
      as: setting.owner,
      method: 'POST',
      url: `/api/workspaces/${setting.workspaceId}/members`,
      body: { email: known.email.toUpperCase(), role: 'owner' },
    })

    expect(bodyAs<Schema<'Member'>>(response)).toMatchObject({
      userId: known.id,
      name: 'Eli Vega',
      role: 'owner',
      status: 'active',
    })
  })

  it.each([
    ['a member', async (setting: Setting) => (await member(setting.workspaceId, 'Eli Vega')).email],
    [
      'a member who has not signed up, whatever the case of the address',
      async (setting: Setting) => {
        const pending = await createPendingPerson(db)
        await join(db, setting.workspaceId, pending)
        return pending.email.toUpperCase()
      },
    ],
  ])('answers 409 for an address that already belongs to the workspace: %s', async (_who, email) => {
    const setting = await newWorkspace()

    const response = await api({
      as: setting.owner,
      method: 'POST',
      url: `/api/workspaces/${setting.workspaceId}/members`,
      body: { email: await email(setting), role: 'member' },
    })

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'conflict' } })
  })
})

const patchMember = (as: Person, workspaceId: string, userId: string, role: WorkspaceRole) =>
  api({ as, method: 'PATCH', url: `/api/workspaces/${workspaceId}/members/${userId}`, body: { role } })
const deleteMember = (as: Person, workspaceId: string, userId: string) =>
  api({ as, method: 'DELETE', url: `/api/workspaces/${workspaceId}/members/${userId}` })

describe('changing the role of a member', () => {
  it('promotes and demotes, and a second owner is what lets the first one step down', async () => {
    const setting = await newWorkspace()
    const colleague = await member(setting.workspaceId, 'Eli Vega')

    const alone = await patchMember(setting.owner, setting.workspaceId, setting.owner.id, 'member')
    const promoted = await patchMember(setting.owner, setting.workspaceId, colleague.id, 'owner')
    const steppedDown = await patchMember(setting.owner, setting.workspaceId, setting.owner.id, 'member')

    expect(alone).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
    expect(bodyAs<Schema<'Member'>>(promoted).role).toBe('owner')
    expect(bodyAs<Schema<'Member'>>(steppedDown).role).toBe('member')
  })

  it('does not count an owner who has not signed up as the one who is kept', async () => {
    const setting = await newWorkspace()
    const pending = await createPendingPerson(db)
    await join(db, setting.workspaceId, pending, 'owner')

    const refused = await patchMember(setting.owner, setting.workspaceId, setting.owner.id, 'member')

    expect(refused).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
  })

  it('answers 404 for somebody who is not a member of the workspace', async () => {
    const setting = await newWorkspace()
    const elsewhere = await createPerson(db, 'Zoe Hartmann')
    await join(db, await createWorkspace(db, 'Almazara'), elsewhere, 'owner')

    const response = await patchMember(setting.owner, setting.workspaceId, elsewhere.id, 'owner')

    expect(response.statusCode).toBe(404)
  })
})

describe('removing a member', () => {
  it('refuses to remove the last owner of the workspace', async () => {
    const setting = await newWorkspace()

    const response = await deleteMember(setting.owner, setting.workspaceId, setting.owner.id)

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'last-owner' } })
  })

  it('hands what they alone owned to the owner who removes them, one event for each document, and only those', async () => {
    const setting = await newWorkspace()
    const leaver = await member(setting.workspaceId, 'Eli Vega')
    const colleague = await member(setting.workspaceId, 'Vera Lund')
    const alone = await documentFor(setting, leaver)
    const archived = await createDocument(db, { workspaceId: setting.workspaceId, creator: leaver, archived: true })
    const shared = await documentFor(setting, leaver)
    await putAccess(setting.owner, shared, colleague.id, 'owner')
    const edited = await documentFor(setting)
    await putAccess(setting.owner, edited, leaver.id, 'editor')

    const response = await deleteMember(setting.owner, setting.workspaceId, leaver.id)

    expect(response.statusCode).toBe(204)
    expect(await grantsOf(alone)).toEqual({ [setting.owner.id]: 'owner' })
    expect(await grantsOf(archived)).toEqual({ [setting.owner.id]: 'owner' })
    // Somebody else who owns it is enough, and what they held as an editor goes with them.
    expect(await grantsOf(shared)).toEqual({ [colleague.id]: 'owner' })
    expect(await grantsOf(edited)).toEqual({ [setting.owner.id]: 'owner' })
    expect(await accessEvents(alone)).toEqual([
      { type: 'access.granted', actor: setting.owner.id, target: setting.owner.id },
    ])
    expect((await accessEvents(shared)).map(({ type }) => type)).toEqual(['access.granted'])
    expect(await accessEvents(edited)).toEqual([{ type: 'access.granted', actor: setting.owner.id, target: leaver.id }])
  })

  it('hands it, when an owner removes themselves, to the one who has been an owner the longest', async () => {
    const setting = await newWorkspace()
    const first = await member(setting.workspaceId, 'Eli Vega', 'owner')
    const second = await member(setting.workspaceId, 'Vera Lund', 'owner')
    const documentId = await documentFor(setting, second)
    await db
      .updateTable('memberships')
      .set({ created_at: new Date('2026-01-01T00:00:00Z') })
      .where('user_id', '=', first.id)
      .execute()
    await db
      .updateTable('memberships')
      .set({ created_at: new Date('2026-06-01T00:00:00Z') })
      .where('user_id', '=', setting.owner.id)
      .execute()

    const response = await deleteMember(second, setting.workspaceId, second.id)

    expect(response.statusCode).toBe(204)
    expect(await grantsOf(documentId)).toEqual({ [first.id]: 'owner' })
  })

  it('takes everything else with them: access to the workspace, their pins, and their place in the list', async () => {
    const setting = await newWorkspace()
    const leaver = await member(setting.workspaceId, 'Eli Vega')
    const documentId = await documentFor(setting)
    await putAccess(setting.owner, documentId, leaver.id, 'editor')
    await api({ as: leaver, method: 'PUT', url: `/api/documents/${documentId}/pin` })

    await deleteMember(setting.owner, setting.workspaceId, leaver.id)

    expect((await api({ as: leaver, method: 'GET', url: `/api/documents/${documentId}` })).statusCode).toBe(404)
    expect((await api({ as: leaver, method: 'GET', url: `/api/workspaces/${setting.workspaceId}` })).statusCode).toBe(
      404,
    )
    expect(await db.selectFrom('pins').select('user_id').where('document_id', '=', documentId).execute()).toEqual([])
    const listed = bodyAs<Schema<'MemberList'>>(await members(setting.workspaceId, setting.owner))
    expect(listed.items.map(({ userId }) => userId)).toEqual([setting.owner.id])
  })

  it('answers 404 for somebody who is not a member, and removes a pending member without fuss', async () => {
    const setting = await newWorkspace()
    const pending = await createPendingPerson(db)
    await join(db, setting.workspaceId, pending)

    const stranger = await deleteMember(setting.owner, setting.workspaceId, randomUUID())
    const removed = await deleteMember(setting.owner, setting.workspaceId, pending.id)

    expect([stranger.statusCode, removed.statusCode]).toEqual([404, 204])
  })
})
