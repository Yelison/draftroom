import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { Locale } from '../../../i18n/locale.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { invalidateAfter } from '../invalidate.ts'

export interface NewDocument {
  title: string
  /** The folder it starts in; none for a loose document. */
  folderId?: string
  /** The template it starts from, in the language of its content; none for a blank document. */
  template?: { id: string; locale: Locale }
}

/** Creates a document in the workspace, blank or from a template, and opens it, which is what "New document" means. */
export function useCreateDocument(workspaceId: string) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({ title, folderId, template }: NewDocument) =>
      dataSource.createDocument({
        params: { path: { workspaceId } },
        body: {
          title,
          ...(folderId === undefined ? {} : { folderId }),
          ...(template === undefined ? {} : { templateId: template.id, locale: template.locale }),
        },
      }),
    onSuccess: async (document) => {
      void invalidateAfter(queryClient, 'createDocument', { workspaceId, documentId: document.id })
      await navigate(`/documents/${document.id}`)
    },
  })
}
