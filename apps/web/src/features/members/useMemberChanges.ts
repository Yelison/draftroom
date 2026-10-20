import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

type WorkspaceRole = Schema<'WorkspaceRole'>

/** What was done, as the screen says it: the person by name, never by id. */
export type MemberChange =
  | { kind: 'invited'; name: string; role: WorkspaceRole }
  | { kind: 'changed'; name: string; role: WorkspaceRole; member: Schema<'Member'> }
  | { kind: 'removed'; name: string }

export interface MemberChangesOptions {
  workspaceId: string
  /** Called for every change the server accepted, once the lists it affects have been marked stale. */
  onDone: (change: MemberChange) => void
  onFailed: (error: Error) => void
}

/**
 * The three ways to change who belongs to the workspace. Each one marks stale what the table of `docs/api/README.md`
 * names for it and says what happened only when the server has said so. Only one runs at a time: the screen leaves the
 * controls alone while it does, so two answers never cross.
 */
export function useMemberChanges({ workspaceId, onDone, onFailed }: MemberChangesOptions) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const path = { workspaceId }

  const invite = useMutation({
    mutationFn: (body: Schema<'AddMemberRequest'>) => dataSource.addMember({ params: { path }, body }),
    onSuccess: async (member) => {
      await invalidateAfter(queryClient, 'addMember', { workspaceId })
      onDone({ kind: 'invited', name: member.name ?? member.email, role: member.role })
    },
    onError: onFailed,
  })

  const setRole = useMutation({
    mutationFn: ({ member, role }: { member: Schema<'Member'>; role: WorkspaceRole }) =>
      dataSource.updateMember({ params: { path: { ...path, userId: member.userId } }, body: { role } }),
    onSuccess: async (member) => {
      // The role the rail shows the person in comes from the workspace, which the table of mutations does not mark stale.
      await Promise.all([
        invalidateAfter(queryClient, 'updateMember', { workspaceId }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId) }),
      ])
      onDone({ kind: 'changed', name: member.name ?? member.email, role: member.role, member })
    },
    onError: onFailed,
  })

  const remove = useMutation({
    mutationFn: (member: Schema<'Member'>) =>
      dataSource.removeMember({ params: { path: { ...path, userId: member.userId } } }),
    onSuccess: async (_nothing, member) => {
      await invalidateAfter(queryClient, 'removeMember', { workspaceId })
      onDone({ kind: 'removed', name: member.name ?? member.email })
    },
    onError: onFailed,
  })

  return {
    invite: invite.mutate,
    setRole: setRole.mutate,
    remove: remove.mutate,
    busy: invite.isPending || setRole.isPending || remove.isPending,
    /** Whether the removal is the one that is on its way, for the dialog that asked for it. */
    removing: remove.isPending,
  }
}
