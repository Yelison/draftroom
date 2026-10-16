import { sql, type Transaction } from 'kysely'
import { leavesNoOwner, transferRecipient, type OwnerCandidate } from '../../domain/access.ts'
import { recordActivity } from '../activity.ts'
import { explicitOwners } from '../access/queries.ts'
import { upsertGrant } from '../access/commands.ts'
import type { Database, WorkspaceRole } from '../tables.ts'
import { findMember, type MemberRow } from './queries.ts'

// The writes to who belongs to a workspace. The memberships involved are locked first, by id, as `lockAccessChange` does
// for a document, and a removal then locks the documents it hands over: memberships before documents, always.

/** A membership held by the transaction, with what the owner rules need to know of the person. */
export interface LockedMember {
  readonly userId: string
  readonly role: WorkspaceRole
  readonly signedUp: boolean
  readonly since: Date
}

/**
 * Locks the owners of the workspace and the people named, until the transaction ends, and returns them as they are now.
 * The caller checks its own right to change members from this (a change that demoted it at the same moment is waited for,
 * and seen), and counts the owners from it, so two owners who demote each other at once cannot leave the workspace with none.
 */
export async function lockMembers(
  trx: Transaction<Database>,
  workspaceId: string,
  userIds: readonly string[],
): Promise<LockedMember[]> {
  const rows = await trx
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.user_id as userId', 'm.role', 'u.signed_up_at as signedUpAt', 'm.created_at as since'])
    .where('m.workspace_id', '=', workspaceId)
    .where((eb) => eb.or([eb('m.role', '=', 'owner'), eb('m.user_id', 'in', [...new Set(userIds)])]))
    .orderBy('m.user_id')
    .forNoKeyUpdate('m')
    .execute()
  return rows.map(({ signedUpAt, ...member }) => ({ ...member, signedUp: signedUpAt !== null }))
}

export const ownersOf = (members: readonly LockedMember[]): OwnerCandidate[] =>
  members.filter(({ role }) => role === 'owner')

export interface NewMember {
  readonly workspaceId: string
  readonly email: string
  readonly role: WorkspaceRole
}

/**
 * Adds a person by email. Someone who already has an account joins as they are; an address nobody has used gets an
 * identity with no name, which is what a pending member is, and signing up with it claims the row. The answer is `null`
 * when the person already belongs to the workspace.
 */
export async function insertMember(trx: Transaction<Database>, member: NewMember): Promise<MemberRow | null> {
  await trx
    .insertInto('users')
    .values({ email: member.email })
    .onConflict((conflict) => conflict.expression(sql`lower(email)`).doNothing())
    .execute()
  const { id } = await trx
    .selectFrom('users')
    .select('id')
    .where(sql<string>`lower(email)`, '=', member.email.toLowerCase())
    .executeTakeFirstOrThrow()
  if ((await findMember(trx, member.workspaceId, id)) !== undefined) return null
  await trx
    .insertInto('memberships')
    .values({ workspace_id: member.workspaceId, user_id: id, role: member.role })
    .execute()
  return (await findMember(trx, member.workspaceId, id)) ?? null
}

export async function updateMemberRole(
  trx: Transaction<Database>,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  await trx
    .updateTable('memberships')
    .set({ role })
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .execute()
}

/**
 * Of the documents a person holds an owner grant on, the ones where nobody else who can act does. The documents are locked
 * first, so a change that would take the other owner away waits and is seen when they are counted.
 */
async function soleOwnedBy(
  trx: Transaction<Database>,
  userId: string,
  documentIds: readonly string[],
): Promise<string[]> {
  if (documentIds.length === 0) return []
  await trx.selectFrom('documents').select('id').where('id', 'in', documentIds).orderBy('id').forNoKeyUpdate().execute()
  const owners = await explicitOwners(trx, documentIds)
  return documentIds.filter((documentId) => leavesNoOwner(owners.get(documentId) ?? [], userId))
}

export interface Removal {
  readonly workspaceId: string
  readonly actorId: string
  readonly removedId: string
  /** The owners of the workspace, locked by this transaction. */
  readonly owners: readonly OwnerCandidate[]
}

/**
 * Removes a member, and first hands over the documents they alone owned: a document always keeps an explicit owner
 * (ADR 0005), and a person who has left cannot be asked to pass them on. The new owner is the one who makes the request,
 * or the longest-standing owner who remains when they remove themselves; each hand-over is an `access.granted` event of
 * that document. Archived documents are handed over too. Everything else the person held (their other grants, their
 * pins) goes with their membership.
 *
 * Returns the documents that were handed over, for the people who have them open to be told.
 */
export async function removeMember(trx: Transaction<Database>, removal: Removal): Promise<string[]> {
  const { workspaceId, actorId, removedId, owners } = removal
  const held = await trx
    .selectFrom('document_access')
    .select('document_id')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', removedId)
    .where('role', '=', 'owner')
    .orderBy('document_id')
    .execute()
  const documentIds = held.map(({ document_id }) => document_id)
  const alone = await soleOwnedBy(trx, removedId, documentIds)
  if (alone.length > 0) {
    const recipient = transferRecipient({ actorId, removedId }, owners)
    // Refused before this point: a workspace never loses its last owner who can act, and the actor is one.
    if (recipient === undefined) throw new Error(`Workspace ${workspaceId} has nobody to receive its documents`)
    for (const documentId of alone)
      await upsertGrant(trx, { workspaceId, documentId, userId: recipient, role: 'owner' })
    await recordActivity(
      trx,
      alone.map((documentId) => ({
        workspaceId,
        documentId,
        type: 'access.granted',
        actorId,
        targetUserId: recipient,
      })),
    )
  }
  await trx.deleteFrom('memberships').where('workspace_id', '=', workspaceId).where('user_id', '=', removedId).execute()
  return alone
}
