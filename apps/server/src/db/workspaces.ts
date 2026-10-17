import type { Kysely, Transaction } from 'kysely'
import type { Database, WorkspaceRole } from './tables.ts'

/** A workspace as the person who asks sees it: with their own role in it. */
export interface WorkspaceOfMember {
  readonly id: string
  readonly name: string
  readonly role: WorkspaceRole
  readonly createdAt: Date
}

const memberWorkspaces = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('workspaces as w')
    .innerJoin('memberships as m', (join) => join.onRef('m.workspace_id', '=', 'w.id').on('m.user_id', '=', userId))
    .select(['w.id', 'w.name', 'm.role', 'w.created_at as createdAt'])

/** The workspaces of a person, by name and then id. */
export function workspacesOf(db: Kysely<Database>, userId: string): Promise<WorkspaceOfMember[]> {
  return memberWorkspaces(db, userId).orderBy('w.name').orderBy('w.id').execute()
}

/** Gives the workspace its new name and answers the name it has now. */
export async function renameWorkspace(db: Kysely<Database>, workspaceId: string, name: string): Promise<string> {
  const renamed = await db
    .updateTable('workspaces')
    .set({ name })
    .where('id', '=', workspaceId)
    .returning('name')
    .executeTakeFirstOrThrow()
  return renamed.name
}

/** The workspace, or nothing when it does not exist or the person is not in it: the two are the same to them. */
export function workspaceOf(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceOfMember | undefined> {
  return memberWorkspaces(db, userId).where('w.id', '=', workspaceId).executeTakeFirst()
}

/**
 * The workspace a person starts with when nobody invited them: one of their own, named as they are (their own content, so
 * nothing is translated and they can rename it in Settings), in which they are the owner. A person who has a seat
 * somewhere already, which is what claiming an invitation gives, gets none. It runs in the transaction that writes the
 * account, so a failure leaves neither.
 */
export async function giveOwnWorkspaceUnlessMember(
  transaction: Transaction<Database>,
  userId: string,
  name: string,
): Promise<void> {
  const seat = await transaction
    .selectFrom('memberships')
    .select('workspace_id')
    .where('user_id', '=', userId)
    .limit(1)
    .executeTakeFirst()
  if (seat !== undefined) return
  const { id } = await transaction.insertInto('workspaces').values({ name }).returning('id').executeTakeFirstOrThrow()
  await transaction.insertInto('memberships').values({ workspace_id: id, user_id: userId, role: 'owner' }).execute()
}
