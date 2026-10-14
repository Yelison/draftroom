import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

export function useCreateFolder(workspaceId: string) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => dataSource.createFolder({ params: { path: { workspaceId } }, body: { name } }),
    onSuccess: () => void invalidateAfter(queryClient, 'createFolder', { workspaceId }),
  })
}
