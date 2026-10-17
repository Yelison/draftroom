import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

/** Renames the workspace. The query of the workspace takes the server's answer, and the list of workspaces is marked stale. */
export function useRenameWorkspace(workspaceId: string) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => dataSource.updateWorkspace({ params: { path: { workspaceId } }, body: { name } }),
    onSuccess: async (workspace) => {
      queryClient.setQueryData(queryKeys.workspace(workspaceId), workspace)
      await invalidateAfter(queryClient, 'updateWorkspace', { workspaceId })
    },
  })
}
