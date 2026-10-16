import { sql, type Kysely } from 'kysely'
import type { OwnerCandidate } from '../../domain/access.ts'
import type { Database, DocumentRole, GeneralAccess, WorkspaceRole } from '../tables.ts'

// The reads of who can open a document, and the facts a live connection is held against when access changes.

/** An explicit grant, with the person it is for. `name` is `null` for a member who has not signed up. */
export interface GrantRow {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  readonly role: DocumentRole
  readonly createdAt: Date
}

const grantsOf = (db: Kysely<Database>, documentId: string) =>
  db
    .selectFrom('document_access as a')
    .innerJoin('users as u', 'u.id', 'a.user_id')
    .select(['a.user_id as userId', 'u.email', 'u.name', 'a.role', 'a.created_at as createdAt'])
    .where('a.document_id', '=', documentId)

/** Every explicit grant on a document, the creator's included, oldest first and then by person. */
export function listGrants(db: Kysely<Database>, documentId: string): Promise<GrantRow[]> {
  return grantsOf(db, documentId).orderBy('a.created_at').orderBy('a.user_id').execute()
}

export function findGrant(db: Kysely<Database>, documentId: string, userId: string): Promise<GrantRow | undefined> {
  return grantsOf(db, documentId).where('a.user_id', '=', userId).executeTakeFirst()
}

export async function isMemberOf(db: Kysely<Database>, workspaceId: string, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('memberships')
    .select('user_id')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row !== undefined
}

/**
 * Who holds an explicit `owner` grant on each of the documents, with what the last-owner rule needs to know of them.
 * A document without one has no entry.
 */
export async function explicitOwners(
  db: Kysely<Database>,
  documentIds: readonly string[],
): Promise<Map<string, OwnerCandidate[]>> {
  const owners = new Map<string, OwnerCandidate[]>()
  if (documentIds.length === 0) return owners
  const rows = await db
    .selectFrom('document_access as a')
    .innerJoin('memberships as m', (join) =>
      join.onRef('m.workspace_id', '=', 'a.workspace_id').onRef('m.user_id', '=', 'a.user_id'),
    )
    .innerJoin('users as u', 'u.id', 'a.user_id')
    .select([
      'a.document_id as documentId',
      'a.user_id as userId',
      'u.signed_up_at as signedUpAt',
      'm.created_at as since',
    ])
    .where('a.document_id', 'in', documentIds)
    .where('a.role', '=', 'owner')
    .execute()
  for (const { documentId, userId, signedUpAt, since } of rows) {
    owners.set(documentId, [...(owners.get(documentId) ?? []), { userId, signedUp: signedUpAt !== null, since }])
  }
  return owners
}

/**
 * Everything the effective role of one person on one document is made of. A live connection is held against these after
 * a change of access, so they are read from the database and never from what the change was told.
 */
export interface AccessFacts {
  readonly documentId: string
  readonly userId: string
  /** `null` for someone who is not in the workspace (any longer). */
  readonly workspaceRole: WorkspaceRole | null
  readonly grant: DocumentRole | null
  readonly generalAccess: GeneralAccess
  readonly archived: boolean
}

/** The facts of every member of the workspace of a document, on that document. */
export function factsOfDocument(db: Kysely<Database>, documentId: string): Promise<AccessFacts[]> {
  return db
    .selectFrom('documents as d')
    .innerJoin('memberships as m', 'm.workspace_id', 'd.workspace_id')
    .leftJoin('document_access as g', (join) =>
      join.onRef('g.document_id', '=', 'd.id').onRef('g.user_id', '=', 'm.user_id'),
    )
    .select([
      'd.id as documentId',
      'm.user_id as userId',
      'm.role as workspaceRole',
      'g.role as grant',
      'd.general_access as generalAccess',
      sql<boolean>`d.archived_at is not null`.as('archived'),
    ])
    .where('d.id', '=', documentId)
    .execute()
}

/** The facts of one person on every document of a workspace, whether they belong to it still or not. */
export function factsOfMember(db: Kysely<Database>, workspaceId: string, userId: string): Promise<AccessFacts[]> {
  return db
    .selectFrom('documents as d')
    .leftJoin('memberships as m', (join) =>
      join.onRef('m.workspace_id', '=', 'd.workspace_id').on('m.user_id', '=', userId),
    )
    .leftJoin('document_access as g', (join) => join.onRef('g.document_id', '=', 'd.id').on('g.user_id', '=', userId))
    .select([
      'd.id as documentId',
      'm.role as workspaceRole',
      'g.role as grant',
      'd.general_access as generalAccess',
      sql<boolean>`d.archived_at is not null`.as('archived'),
    ])
    .select((eb) => eb.val(userId).as('userId'))
    .where('d.workspace_id', '=', workspaceId)
    .execute()
}
