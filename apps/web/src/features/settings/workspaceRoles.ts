import type { Schema } from '@draftroom/contract'

type WorkspaceRole = Schema<'WorkspaceRole'>
type Member = Schema<'Member'>

/** The roles a member of the workspace can have, from the least to the most. */
export const workspaceRoles: readonly WorkspaceRole[] = ['member', 'owner']

export const isWorkspaceRole = (value: string): value is WorkspaceRole => workspaceRoles.some((role) => role === value)

/**
 * Whether taking the ownership from the member leaves nobody who can act as owner. The rule of the server's
 * `leavesNoOwner`: it applies to an owner who has signed up, and only the owners who have signed up count, because a
 * pending owner cannot act until they do. The interface offers nothing that would break it; the server has the last word
 * (`409 last-owner`).
 */
export function isLastOwner(members: readonly Member[], member: Member): boolean {
  const canAct = ({ role, status }: Member) => role === 'owner' && status === 'active'
  return canAct(member) && !members.some((other) => other.userId !== member.userId && canAct(other))
}

/** How a member is named wherever the screen speaks of them: a pending member has no name yet, only an email. */
export const displayName = (member: Pick<Member, 'name' | 'email'>): string => member.name ?? member.email
