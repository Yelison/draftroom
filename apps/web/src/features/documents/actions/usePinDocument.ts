import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

/**
 * Pins a document for the person, or takes the pin off, as the document is now. A pin is a personal mark, so every role
 * that can read the document may make it.
 */
export function usePinDocument() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, pinned }: Schema<'Document'>) => {
      const request = { params: { path: { documentId: id } } }
      await (pinned ? dataSource.unpinDocument(request) : dataSource.pinDocument(request))
    },
    onSuccess: (_result, { id, workspaceId, pinned }) =>
      invalidateAfter(queryClient, pinned ? 'unpinDocument' : 'pinDocument', { workspaceId, documentId: id }),
  })
}
