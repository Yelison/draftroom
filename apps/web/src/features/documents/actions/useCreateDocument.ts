import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

export interface NewDocument {
  title: string
  /** The folder it starts in; none for a loose document. */
  folderId?: string
}

/** Creates a blank document in the workspace and opens it, which is what "New document" means. */
export function useCreateDocument(workspaceId: string) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({ title, folderId }: NewDocument) =>
      dataSource.createDocument({
        params: { path: { workspaceId } },
        body: { title, ...(folderId === undefined ? {} : { folderId }) },
      }),
    onSuccess: async (document) => {
      void invalidateAfter(queryClient, 'createDocument', { workspaceId, documentId: document.id })
      await navigate(`/documents/${document.id}`)
    },
  })
}
