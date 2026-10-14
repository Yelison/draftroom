import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '../../../data/errors.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

export interface DocumentChange {
  document: Schema<'Document'>
  /** The revision the change is made on: the document's, or the server's after a conflict. */
  revision: number
  title?: string
  /** `null` takes the document out of its folder. */
  folderId?: string | null
}

/** Renames a document, moves it to a folder, or both, with the revision it was last read at. */
export function useUpdateDocument() {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()

  const invalidate = ({ document }: DocumentChange) =>
    invalidateAfter(queryClient, 'updateDocument', { workspaceId: document.workspaceId, documentId: document.id })

  return useMutation({
    mutationFn: ({ document, revision, title, folderId }: DocumentChange) =>
      dataSource.updateDocument({
        params: { path: { documentId: document.id } },
        body: {
          revision,
          ...(title === undefined ? {} : { title }),
          ...(folderId === undefined ? {} : { folderId }),
        },
      }),
    onSuccess: (_updated, change) => void invalidate(change),
    // A conflict says the lists on screen are behind the server: they are read again so the person sees what changed.
    onError: (error, change) => {
      if (isApiError(error, 'revision-conflict')) void invalidate(change)
    },
  })
}
