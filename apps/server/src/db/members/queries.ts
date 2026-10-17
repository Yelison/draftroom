import type { Kysely } from 'kysely'
import { inMilliseconds } from '../milliseconds.ts'
import type { Database, WorkspaceRole } from '../tables.ts'

/** A member of a workspace, pending ones included: `signedUpAt` is `null` until their email signs up. */
export interface MemberRow {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  readonly role: WorkspaceRole
  readonly signedUpAt: Date | null
  readonly createdAt: Date
}

const membersOf = (db: Kysely<Database>, workspaceId: string) =>
  db
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select([
      'm.user_id as userId',
      'u.email',
      'u.name',
      'm.role',
      'u.signed_up_at as signedUpAt',
      'm.created_at as createdAt',
    ])
    .where('m.workspace_id', '=', workspaceId)

/** The members of a workspace, in the order they joined (to the millisecond, as the API shows it) and then by person. */
export function listMembers(db: Kysely<Database>, workspaceId: string): Promise<MemberRow[]> {
  return membersOf(db, workspaceId).orderBy(inMilliseconds('m.created_at')).orderBy('m.user_id').execute()
}

export function findMember(db: Kysely<Database>, workspaceId: string, userId: string): Promise<MemberRow | undefined> {
  return membersOf(db, workspaceId).where('m.user_id', '=', userId).executeTakeFirst()
}
