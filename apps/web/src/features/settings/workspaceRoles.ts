import type { Schema } from '@draftroom/contract'

type WorkspaceRole = Schema<'WorkspaceRole'>
type Member = Schema<'Member'>

/** The roles a member of the workspace can have, from the least to the most. */
export const workspaceRoles: readonly WorkspaceRole[] = ['member', 'owner']

export const isWorkspaceRole = (value: string): value is WorkspaceRole => workspaceRoles.some((role) => role === value)

/**
 * Whether the member is the only owner. The interface offers nothing that would leave the workspace without one; the
 * server enforces the same rule and has the last word (`409 last-owner`).
 */
export function isLastOwner(members: readonly Member[], member: Member): boolean {
  return member.role === 'owner' && members.filter(({ role }) => role === 'owner').length === 1
}

/** How a member is named wherever the screen speaks of them: a pending member has no name yet, only an email. */
export const displayName = (member: Pick<Member, 'name' | 'email'>): string => member.name ?? member.email
