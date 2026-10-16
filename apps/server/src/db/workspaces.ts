import type { Kysely } from 'kysely'
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

/** The workspace, or nothing when it does not exist or the person is not in it: the two are the same to them. */
export function workspaceOf(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceOfMember | undefined> {
  return memberWorkspaces(db, userId).where('w.id', '=', workspaceId).executeTakeFirst()
}
