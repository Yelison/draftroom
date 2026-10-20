import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

/** Renames a workspace. The query of the workspace takes the server's answer, and the list of workspaces is marked stale. */
export function useRenameWorkspace() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
      dataSource.updateWorkspace({ params: { path: { workspaceId } }, body: { name } }),
    onSuccess: async (workspace, { workspaceId }) => {
      queryClient.setQueryData(queryKeys.workspace(workspaceId), workspace)
      await invalidateAfter(queryClient, 'updateWorkspace', { workspaceId })
    },
  })
}
