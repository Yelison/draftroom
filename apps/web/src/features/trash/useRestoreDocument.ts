import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'
import { isGone } from './gone.ts'

export interface RestoreDocumentOptions {
  /** Called for every restore the server answered, not only the last one asked for. */
  onRestored: (document: Schema<'Document'>) => void
  /** Called for every restore the server refused; `isGone` says whether someone else had deleted the document first. */
  onFailed: (document: Schema<'Document'>, error: Error) => void
}

/**
 * Restores archived documents, any number of them at once. When someone else deleted one first the lists are read again
 * all the same, so the row that is no longer true leaves them.
 *
 * What the screen does after each answer goes in the options of the mutation itself: the callbacks of `mutate` run only
 * for the latest call, and a restore that overlaps another would go unannounced.
 */
export function useRestoreDocument({ onRestored, onFailed }: RestoreDocumentOptions) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set())
  const invalidate = (document: Schema<'Document'>) =>
    void invalidateAfter(queryClient, 'restoreDocument', { workspaceId: document.workspaceId, documentId: document.id })

  const mutation = useMutation({
    mutationFn: (document: Schema<'Document'>) =>
      dataSource.restoreDocument({ params: { path: { documentId: document.id } } }),
    onMutate: (document) => setRestoring((ids) => new Set(ids).add(document.id)),
    // Not awaited: the person is told as soon as the server has answered, and the list follows when it has been read.
    onSuccess: (_restored, document) => {
      invalidate(document)
      onRestored(document)
    },
    onError: (error, document) => {
      if (isGone(error)) invalidate(document)
      onFailed(document, error)
    },
    onSettled: (_restored, _error, document) =>
      setRestoring((ids) => new Set([...ids].filter((id) => id !== document.id))),
  })

  return { restore: mutation.mutate, restoring }
}
