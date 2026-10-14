import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { useDataSource } from '../../../data/useDataSource.ts'
import { archivedNotice } from '../archivedNotice.ts'
import { invalidateAfter } from '../invalidate.ts'

/**
 * Archives a document. When it is the one that is open, the person is taken to Documents, and the notice of what
 * happened travels with them: the screen they were on is gone, and so would be an announcement made from it.
 */
export function useArchiveDocument() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { documentId: openDocumentId } = useParams()

  return useMutation({
    mutationFn: (document: Schema<'Document'>) =>
      dataSource.archiveDocument({ params: { path: { documentId: document.id } } }),
    onSuccess: async (archived) => {
      const invalidate = () =>
        invalidateAfter(queryClient, 'archiveDocument', { workspaceId: archived.workspaceId, documentId: archived.id })
      if (archived.id !== openDocumentId) return void invalidate()
      // The editor is read again only once it has left the screen: it would otherwise ask for a document that is gone.
      await navigate('/documents', { state: archivedNotice(archived.title) })
      void invalidate()
    },
  })
}
