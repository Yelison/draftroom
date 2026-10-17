import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

/** Restores a version. The versions, the history and the activity of the document are read again once it has. */
export function useRestoreVersion(document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (version: Schema<'Version'>) =>
      dataSource.restoreVersion({ params: { path: { versionId: version.id } } }),
    // After a refusal too: a version that was added meanwhile, or the `pre-restore` of a pass that failed, is on the list.
    onSettled: () =>
      invalidateAfter(queryClient, 'restoreVersion', { workspaceId: document.workspaceId, documentId: document.id }),
  })
}
