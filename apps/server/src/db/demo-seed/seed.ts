import { sql, type Kysely, type Transaction } from 'kysely'
import { createDocumentRows } from '../documents/commands.ts'
import type { Database } from '../tables.ts'
import { almazara, demoPeople, harborAndPine, type DemoWorkspace } from './content.ts'

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
    await trx
      .updateTable('documents')
      .set({
        general_access: document.generalAccess ?? 'none',
        archived_at: document.archived === true ? sql`now() - make_interval(days => ${document.daysAgo})` : null,
        updated_at: sql`now() - make_interval(days => ${document.daysAgo})`,
      })
      .where('id', '=', id)
      .execute()
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

  await database.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values(demoPeople.map((person) => ({ ...person, signed_up_at: new Date() })))
      .execute()
    const userIds = new Map(demoPeople.map((person) => [person.email, person.id]))
    for (const workspace of [harborAndPine, almazara]) await seedWorkspace(trx, workspace, userIds)
  })
  return true
}
