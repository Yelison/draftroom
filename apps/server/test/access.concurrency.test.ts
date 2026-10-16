import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, type Api, type Call } from './support/api.ts'
import { whileHeld } from './support/overlap.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// What happens when a change of access and a change that depends on it overlap (ADR 0012). The caller's role is read
// before the transaction, so it has to be read again once the locks are held: a person who is revoked at the same
// moment must not go on to write with the role they had. The overlap is made on purpose: a transaction that has
// revoked, and has not committed, holds what the other change needs, and is released once the other has queued behind it.

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
  readonly documentId: string
  /** The one who acts: made an owner of the document by a grant, or of the workspace by their role. */
  readonly actor: Person
  /** Somebody with an editor grant, for the calls that change or remove a grant. */
  readonly colleague: Person
  /** Another owner of the document, so that what the actor does is allowed by the last-owner rule. */
  readonly other: Person
}

async function newSetting(actorIs: 'document-owner' | 'workspace-owner'): Promise<Setting> {
  const workspaceId = await createWorkspace(db)
  const actor = await createPerson(db, 'Eli Vega')
  const other = await createPerson(db, 'Marta Ruiz')
  const colleague = await createPerson(db, 'Vera Lund')
  await join(db, workspaceId, actor, actorIs === 'workspace-owner' ? 'owner' : 'member')
  await join(db, workspaceId, other, 'owner')
  await join(db, workspaceId, colleague)
  const documentId = await createDocument(db, { workspaceId, creator: other })
  await grant(db, { workspaceId, documentId, person: colleague, role: 'editor' })
  if (actorIs === 'document-owner') await grant(db, { workspaceId, documentId, person: actor, role: 'owner' })
  return { workspaceId, documentId, actor, colleague, other }
}

const documentCalls: readonly (readonly [string, (s: Setting) => Omit<Call, 'as'>])[] = [
  [
    'setAccess',
    (s) => ({ method: 'PUT', url: `/api/documents/${s.documentId}/access/${s.colleague.id}`, body: { role: 'owner' } }),
  ],
  ['removeAccess', (s) => ({ method: 'DELETE', url: `/api/documents/${s.documentId}/access/${s.colleague.id}` })],
  [
    'setGeneralAccess',
    (s) => ({ method: 'PUT', url: `/api/documents/${s.documentId}/general-access`, body: { generalAccess: 'editor' } }),
  ],
]

const memberCalls: readonly (readonly [string, (s: Setting) => Omit<Call, 'as'>])[] = [
  [
    'addMember',
    (s) => ({
      method: 'POST',
      url: `/api/workspaces/${s.workspaceId}/members`,
      body: { email: 'lucia@harborpine.example', role: 'member' },
    }),
  ],
  [
    'updateMember',
    (s) => ({
      method: 'PATCH',
      url: `/api/workspaces/${s.workspaceId}/members/${s.colleague.id}`,
      body: { role: 'owner' },
    }),
  ],
  ['removeMember', (s) => ({ method: 'DELETE', url: `/api/workspaces/${s.workspaceId}/members/${s.colleague.id}` })],
]

/** What the calls above would have changed, which must all be as they were. */
async function snapshot(s: Setting) {
  return {
    grants: await db
      .selectFrom('document_access')
      .select(['user_id', 'role'])
      .where('document_id', '=', s.documentId)
      .orderBy('user_id')
      .execute(),
    generalAccess: (
      await db.selectFrom('documents').select('general_access').where('id', '=', s.documentId).executeTakeFirstOrThrow()
    ).general_access,
    members: await db
      .selectFrom('memberships')
      .select(['user_id', 'role'])
      .where('workspace_id', '=', s.workspaceId)
      .orderBy('user_id')
      .execute(),
    events: (await db.selectFrom('activity_events').select('id').where('document_id', '=', s.documentId).execute())
      .length,
  }
}

describe('a person whose authority is taken away at the moment they act', () => {
  it.each(documentCalls)(
    'is refused %s with what their role is now, when another owner removed their grant, and nothing is written',
    async (_operationId, call) => {
      const setting = await newSetting('document-owner')
      const before = await snapshot(setting)

      const [answer] = await whileHeld(
        db,
        async (trx) => {
          // What another owner's removal of the grant does: it holds the document, and the grant is gone when it commits.
          await sql`select 1 from documents where id = ${setting.documentId} for no key update`.execute(trx)
          await trx
            .deleteFrom('document_access')
            .where('document_id', '=', setting.documentId)
            .where('user_id', '=', setting.actor.id)
            .execute()
        },
        () => [api({ as: setting.actor, ...call(setting) })],
      )

      // No grant and nothing from the general access: the document does not exist for them any more.
      expect(answer?.statusCode).toBe(404)
      expect(await snapshot(setting)).toEqual({
        ...before,
        grants: before.grants.filter(({ user_id }) => user_id !== setting.actor.id),
      })
    },
  )

  it.each(documentCalls)(
    'is refused %s when they were an owner of the workspace and have been made a member, and nothing is written',
    async (_operationId, call) => {
      const setting = await newSetting('workspace-owner')
      const before = await snapshot(setting)

      const [answer] = await whileHeld(
        db,
        async (trx) => {
          await trx
            .updateTable('memberships')
            .set({ role: 'member' })
            .where('workspace_id', '=', setting.workspaceId)
            .where('user_id', '=', setting.actor.id)
            .execute()
        },
        () => [api({ as: setting.actor, ...call(setting) })],
      )

      expect(answer?.statusCode).toBe(404)
      expect(await snapshot(setting)).toEqual({
        ...before,
        members: before.members.map((row) => (row.user_id === setting.actor.id ? { ...row, role: 'member' } : row)),
      })
    },
  )

  it.each(memberCalls)(
    'is refused %s when they were an owner of the workspace and have been made a member, and nothing is written',
    async (_operationId, call) => {
      const setting = await newSetting('workspace-owner')
      const before = await snapshot(setting)

      const [answer] = await whileHeld(
        db,
        async (trx) => {
          await trx
            .updateTable('memberships')
            .set({ role: 'member' })
            .where('workspace_id', '=', setting.workspaceId)
            .where('user_id', '=', setting.actor.id)
            .execute()
        },
        () => [api({ as: setting.actor, ...call(setting) })],
      )

      // Still a member of the workspace, so it exists for them, and what they may do in it is not this.
      expect(answer?.statusCode).toBe(403)
      expect(await snapshot(setting)).toEqual({
        ...before,
        members: before.members.map((row) => (row.user_id === setting.actor.id ? { ...row, role: 'member' } : row)),
      })
    },
  )
})

/** Makes a commit to these tables take a while, so that a change that does not wait for the lock reads what is not there yet. */
async function whileCommitsAreSlow<T>(tables: readonly string[], run: () => Promise<T>): Promise<T> {
  await sql`create or replace function slow_commit() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.4); return null; end $$`.execute(db)
  for (const table of tables) {
    await sql`create constraint trigger ${sql.id(`${table}_slow_commit`)} after insert or update or delete on ${sql.table(table)}
      deferrable initially deferred for each row execute function slow_commit()`.execute(db)
  }
  try {
    return await run()
  } finally {
    for (const table of tables)
      await sql`drop trigger ${sql.id(`${table}_slow_commit`)} on ${sql.table(table)}`.execute(db)
  }
}

describe('two changes that would each leave nobody as an owner', () => {
  it('let the first through and refuse the second, for the explicit owners of a document', async () => {
    // Both are owners of the workspace too, so that neither loses the right to act when the other one's grant is lowered:
    // what stops the second is the last-owner rule, and nothing else.
    const setting = await newSetting('workspace-owner')
    const { actor, other, documentId, workspaceId } = setting
    await grant(db, { workspaceId, documentId, person: actor, role: 'owner' })
    const lower = (as: Person, whom: Person) =>
      api({ as, method: 'PUT', url: `/api/documents/${documentId}/access/${whom.id}`, body: { role: 'viewer' } })

    const answers = await whileCommitsAreSlow(['document_access'], () =>
      Promise.all([lower(actor, other), lower(other, actor)]),
    )

    expect(answers.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
    const owners = await db
      .selectFrom('document_access')
      .select('user_id')
      .where('document_id', '=', documentId)
      .where('role', '=', 'owner')
      .execute()
    expect(owners).toHaveLength(1)
  })

  it('let the first through and refuse the second, for the owners of a workspace who each step down', async () => {
    const setting = await newSetting('workspace-owner')
    const { actor, other, workspaceId } = setting
    const stepDown = (person: Person) =>
      api({
        as: person,
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${person.id}`,
        body: { role: 'member' },
      })

    const answers = await whileCommitsAreSlow(['memberships'], () => Promise.all([stepDown(actor), stepDown(other)]))

    expect(answers.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
    const owners = await db
      .selectFrom('memberships')
      .select('user_id')
      .where('workspace_id', '=', workspaceId)
      .where('role', '=', 'owner')
      .execute()
    expect(owners).toHaveLength(1)
  })

  it('never leave a document without an explicit owner, when one owner is removed from the workspace as the other gives up their grant', async () => {
    const workspaceId = await createWorkspace(db)
    const boss = await createPerson(db, 'Marta Ruiz')
    const first = await createPerson(db, 'Eli Vega')
    const second = await createPerson(db, 'Vera Lund')
    await join(db, workspaceId, boss, 'owner')
    for (const person of [first, second]) await join(db, workspaceId, person)
    const documentId = await createDocument(db, { workspaceId, creator: first })
    await grant(db, { workspaceId, documentId, person: second, role: 'owner' })

    const answers = await whileCommitsAreSlow(['document_access', 'memberships'], () =>
      Promise.all([
        api({ as: boss, method: 'DELETE', url: `/api/workspaces/${workspaceId}/members/${first.id}` }),
        // The other owner is only a member of the workspace, so the two changes meet at the document and nowhere else.
        api({ as: second, method: 'DELETE', url: `/api/documents/${documentId}/access/${second.id}` }),
      ]),
    )

    // Whichever went first, the document is left with somebody who owns it: the removal hands it over, or the other is refused.
    expect(answers.map(({ statusCode }) => statusCode).sort()).toEqual(expect.arrayContaining([204]))
    const owners = await db
      .selectFrom('document_access')
      .select('user_id')
      .where('document_id', '=', documentId)
      .where('role', '=', 'owner')
      .execute()
    expect(owners.length).toBeGreaterThanOrEqual(1)
  })
})
