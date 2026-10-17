import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'
import { useWorkspaceId } from '../documents/useWorkspaceId.ts'

/**
 * Changes the account of the signed-in person. The query of who they are takes the server's answer as it is, so what the
 * screens show is what was stored; the lists that show their name to others are marked stale.
 */
export function useUpdateMe() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId().data

  return useMutation({
    mutationFn: (changes: Schema<'UpdateMeRequest'>) => dataSource.updateMe({ body: changes }),
    onSuccess: async (me) => {
      queryClient.setQueryData(queryKeys.me(), me)
      if (workspaceId !== undefined) await invalidateAfter(queryClient, 'updateMe', { workspaceId })
    },
  })
}
