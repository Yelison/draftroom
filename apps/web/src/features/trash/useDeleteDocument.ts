import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'
import { isGone } from './gone.ts'

/**
 * Deletes an archived document for good. When someone else restored or deleted it first the lists are read again all the
 * same, so the row that is no longer true leaves them; the caller says why.
 */
export function useDeleteDocument() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const invalidate = (document: Schema<'Document'>) =>
    void invalidateAfter(queryClient, 'deleteDocument', { workspaceId: document.workspaceId, documentId: document.id })

  return useMutation({
    mutationFn: (document: Schema<'Document'>) =>
      dataSource.deleteDocument({ params: { path: { documentId: document.id } } }),
    onSuccess: (_deleted, document) => invalidate(document),
    onError: (error, document) => {
      if (isGone(error)) invalidate(document)
    },
  })
}
