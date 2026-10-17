import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

/** Saves the document as it is now as a version, with the name the person gave it, if they did. */
export function useSaveVersion(document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (label: string) =>
      dataSource.createVersion({
        params: { path: { documentId: document.id } },
        ...(label === '' ? {} : { body: { label } }),
      }),
    onSuccess: () =>
      invalidateAfter(queryClient, 'createVersion', { workspaceId: document.workspaceId, documentId: document.id }),
  })
}
