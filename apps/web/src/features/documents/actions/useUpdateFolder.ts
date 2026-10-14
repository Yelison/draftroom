import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '../../../data/errors.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

export interface FolderRename {
  folder: Schema<'Folder'>
  /** The revision the change is made on: the folder's, or the server's after a conflict. */
  revision: number
  name: string
}

export function useUpdateFolder() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  const invalidate = ({ folder }: FolderRename) =>
    invalidateAfter(queryClient, 'updateFolder', { workspaceId: folder.workspaceId })

  return useMutation({
    mutationFn: ({ folder, revision, name }: FolderRename) =>
      dataSource.updateFolder({ params: { path: { folderId: folder.id } }, body: { name, revision } }),
    onSuccess: (_updated, rename) => void invalidate(rename),
    onError: (error, rename) => {
      if (isApiError(error, 'revision-conflict')) void invalidate(rename)
    },
  })
}
