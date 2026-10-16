import type { DocumentRole, Schema } from '@draftroom/contract'
import type { AuthorizedScope } from '@draftroom/contract/collab'

// What changing someone's access means: which event the history records, when a change would leave a document or a
// workspace without an owner, who inherits what a removed member alone owned, and what a change does to a connection
// that is already open. The permission rules (who may change access at all) are `manage-access` and `manage-members` in
// `permissions.ts`; this is what is decided once they have said yes. No input or output of its own.

type ActivityType = Schema<'ActivityType'>

/** The event of a grant that goes from `previous` to `next`, or `null` when nothing changed and so nothing is recorded. */
export function grantActivity(previous: DocumentRole | null, next: DocumentRole | null): ActivityType | null {
  if (previous === next) return null
  if (previous === null) return 'access.granted'
  if (next === null) return 'access.revoked'
  return 'access.changed'
}

/**
 * Someone who holds an owner role. A member added by email who has not signed up holds it too, but nobody is them: they
 * cannot act, so they do not count as the owner a workspace or a document must keep (ADR 0012).
 */
export interface OwnerCandidate {
  readonly userId: string
  readonly signedUp: boolean
  /** When they became a member, for the person who has been an owner the longest. */
  readonly since: Date
}

const activeOwnersExcept = (owners: readonly OwnerCandidate[], userId: string): OwnerCandidate[] =>
  owners.filter((owner) => owner.signedUp && owner.userId !== userId)

/**
 * Whether taking the ownership from `targetId` leaves nobody who can act as owner. It only applies to someone who is an
 * owner who can act: removing a pending owner, or someone who is not an owner, loses nothing.
 */
export function leavesNoOwner(owners: readonly OwnerCandidate[], targetId: string): boolean {
  const target = owners.find((owner) => owner.userId === targetId)
  return target !== undefined && target.signedUp && activeOwnersExcept(owners, targetId).length === 0
}

/**
 * Who receives the documents that the removed member alone owned: the owner who makes the request, or, when they remove
 * themselves, the one who has been an owner the longest among those who remain. `undefined` only when nobody remains,
 * which `leavesNoOwner` refuses first.
 */
export function transferRecipient(
  { actorId, removedId }: { readonly actorId: string; readonly removedId: string },
  owners: readonly OwnerCandidate[],
): string | undefined {
  if (actorId !== removedId) return actorId
  const [longestStanding] = activeOwnersExcept(owners, removedId).sort(
    (first, second) => first.since.getTime() - second.since.getTime() || first.userId.localeCompare(second.userId),
  )
  return longestStanding?.userId
}

/** What a person's connection can do, as protocol §4 decides it: `refused` when they may not even know the document exists. */
export type ConnectionAccess = AuthorizedScope | 'refused'

/** How an open connection ends when the person's access changes: `access-revoked` or `role-changed` (protocol §6.2). */
export type Closure = 'access-revoked' | 'role-changed'

/**
 * What a change of access does to a connection that is open. Modes are compared, not roles: an editor made owner keeps
 * writing and needs nothing, while a viewer made editor must reconnect to be allowed to (and the reverse), and nobody
 * who is refused now keeps a connection at all.
 */
export function closureFor(connected: ConnectionAccess, current: ConnectionAccess): Closure | null {
  if (current === 'refused') return 'access-revoked'
  return connected === current ? null : 'role-changed'
}
