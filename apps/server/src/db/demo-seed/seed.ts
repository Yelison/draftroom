import { sql, type Kysely, type Transaction } from 'kysely'
import { createPasswords } from '../../http/auth/passwords.ts'
import { createDocumentRows } from '../documents/commands.ts'
import type { Database } from '../tables.ts'
import { almazara, demoPassword, demoPeople, harborAndPine, type DemoWorkspace } from './content.ts'

// Fills an empty database with two demo workspaces for development and the end-to-end tests. Documents are created by
// the same function the API uses, so each one has its content, its owner and its first event like a real one; only the
// sharing and the dates are set afterwards, which the API would do through other operations.

async function seedWorkspace(
  trx: Transaction<Database>,
  workspace: DemoWorkspace,
  userIds: ReadonlyMap<string, string>,
) {
  const userOf = (email: string): string => {
    const id = userIds.get(email)
    if (id === undefined) throw new Error(`The demo has no person with the address ${email}`)
    return id
  }
  await trx.insertInto('workspaces').values({ id: workspace.id, name: workspace.name }).execute()
  await trx
    .insertInto('memberships')
    .values(workspace.members.map(({ email, role }) => ({ workspace_id: workspace.id, user_id: userOf(email), role })))
    .execute()

  const folderIds = new Map<string, string>()
  for (const name of workspace.folders) {
    const { id } = await trx
      .insertInto('folders')
      .values({ workspace_id: workspace.id, name })
      .returning('id')
      .executeTakeFirstOrThrow()
    folderIds.set(name, id)
  }

  for (const document of workspace.documents) {
    const folderId = document.folder === undefined ? null : (folderIds.get(document.folder) ?? null)
    const id = await createDocumentRows(trx, {
      workspaceId: workspace.id,
      title: document.title,
      folderId,
      createdBy: userOf(document.creator),
    })
    // The document, and the event that says it was created, are as old as it is, and the last change is as recent as
    // it says: a demo workspace that shows documents "created today, changed nine days ago" would not read as real.
    // An archived document also has the event of its archiving, on the day it was archived and after its creation, so
    // the history shows how it got there; archiving moved its revision on, as it does for a person.
    const ago = (days: number) => sql<Date>`now() - make_interval(days => ${days})`
    const archived = document.archived === true
    await trx
      .updateTable('documents')
      .set({
        general_access: document.generalAccess ?? 'none',
        archived_at: archived ? ago(document.daysAgo) : null,
        revision: archived ? 2 : 1,
        created_at: ago(document.createdDaysAgo ?? document.daysAgo),
        updated_at: ago(document.daysAgo),
      })
      .where('id', '=', id)
      .execute()
    await trx
      .updateTable('activity_events')
      .set({ created_at: ago(document.createdDaysAgo ?? document.daysAgo) })
      .where('document_id', '=', id)
      .where('type', '=', 'document.created')
      .execute()
    if (archived) {
      await trx
        .insertInto('activity_events')
        .values({
          workspace_id: workspace.id,
          document_id: id,
          type: 'document.archived',
          actor_id: userOf(document.creator),
          created_at: ago(document.daysAgo),
        })
        .execute()
    }
    for (const [email, role] of Object.entries(document.grants ?? {})) {
      await trx
        .insertInto('document_access')
        .values({ workspace_id: workspace.id, document_id: id, user_id: userOf(email), role })
        .execute()
    }
    for (const email of document.pinnedBy ?? []) {
      await trx
        .insertInto('pins')
        .values({ workspace_id: workspace.id, document_id: id, user_id: userOf(email) })
        .execute()
    }
  }
}

/** Seeds the demo, or does nothing when it is already there. Returns whether it seeded. */
export async function seedDemo(database: Kysely<Database>): Promise<boolean> {
  const existing = await database
    .selectFrom('workspaces')
    .select('id')
    .where('id', '=', harborAndPine.id)
    .executeTakeFirst()
  if (existing !== undefined) return false

  // One hash for everyone: it is a demo password, and Argon2id takes time that a seed of seven people has no use for.
  const passwordHash = await createPasswords().hash(demoPassword)
  await database.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values(demoPeople.map((person) => ({ ...person, password_hash: passwordHash, signed_up_at: new Date() })))
      .execute()
    const userIds = new Map(demoPeople.map((person) => [person.email, person.id]))
    for (const workspace of [harborAndPine, almazara]) await seedWorkspace(trx, workspace, userIds)
  })
  return true
}
