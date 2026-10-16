import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'
import { isGone } from './gone.ts'

/**
 * Restores an archived document. When someone else deleted it first the lists are read again all the same, so the row
 * that is no longer true leaves them; the caller says why.
 */
export function useRestoreDocument() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const invalidate = (document: Schema<'Document'>) =>
    void invalidateAfter(queryClient, 'restoreDocument', { workspaceId: document.workspaceId, documentId: document.id })

  return useMutation({
    mutationFn: (document: Schema<'Document'>) =>
      dataSource.restoreDocument({ params: { path: { documentId: document.id } } }),
    // Not awaited: the person is told as soon as the server has answered, and the list follows when it has been read.
    onSuccess: (_restored, document) => invalidate(document),
    onError: (error, document) => {
      if (isGone(error)) invalidate(document)
    },
  })
}
