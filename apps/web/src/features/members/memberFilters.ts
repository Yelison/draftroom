import type { Schema } from '@draftroom/contract'

type Member = Schema<'Member'>

/** The ways to narrow the list, in the order they are offered. */
export const memberFilters = ['all', 'owners', 'pending'] as const
export type MemberFilter = (typeof memberFilters)[number]

const keeps: Record<MemberFilter, (member: Member) => boolean> = {
  all: () => true,
  owners: (member) => member.role === 'owner',
  pending: (member) => member.status === 'pending',
}

/** The members the filter keeps, in the order the server gave them: the list is whole in the page, so this is exact. */
export const filterMembers = (members: readonly Member[], filter: MemberFilter): Member[] =>
  members.filter(keeps[filter])

/** The two numbers of the headline count: the people who have signed up, and the invitations still waiting. */
export function countMembers(members: readonly Member[]): { members: number; pending: number } {
  const pending = members.filter(keeps.pending).length
  return { members: members.length - pending, pending }
}
