import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { useNavigate } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'
import { copyTitle } from './copyTitle.ts'

/**
 * Copies the content of the open document into a new one and opens it: the way out of a document that is too large to
 * keep editing. The copy is the person's own, in their language; the original stays as it is and still opens.
 */
export function useDuplicateDocument(document: Schema<'Document'>) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const intl = useIntl()

  return useMutation({
    mutationFn: () =>
      dataSource.duplicateDocument({
        params: { path: { documentId: document.id } },
        body: { title: copyTitle(intl, document.title) },
      }),
    onSuccess: async (copy) => {
      void invalidateAfter(queryClient, 'duplicateDocument', { workspaceId: copy.workspaceId, documentId: copy.id })
      // The route's navigation puts the focus on the title of the document that opens.
      await navigate(`/documents/${copy.id}`)
    },
  })
}
