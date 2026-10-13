import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { isApiError, type ApiError } from '../../data/errors.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { documentQuery } from './documentQuery.ts'

type DocumentMeta = Schema<'Document'>

/** What went wrong with the title, which the field says next to itself. */
export type TitleProblem = 'required' | 'tooLong' | 'conflict' | 'failed'

/** The text cut to a number of Unicode code points, which is how the contract counts: an emoji is one, though it is two UTF-16 units. */
const clipToCodePoints = (text: string, max: number) => {
  const points = [...text]
  return points.length <= max ? text : points.slice(0, max).join('')
}

/** The document the server holds now, when the answer says the title was changed under us. */
function currentFromConflict(error: ApiError): DocumentMeta | null {
  const { problem } = error
  return 'current' in problem && 'title' in problem.current ? problem.current : null
}

/**
 * The title of a document as a field the person edits: what they have typed, saved with the document's `revision` when
 * they leave the field or press Enter.
 *
 * - The title is the document's metadata, saved by `updateDocument`; it is not part of the Yjs content.
 * - The field shows what the person typed until that is saved, and the server's title the rest of the time, so a change
 *   someone else made arrives in a field the person has not touched.
 * - Saves are queued by the mutation's `scope`, and each reads the revision from the cache when it runs, so two quick
 *   saves never send the same revision (which the second would lose to the first).
 * - A `409` puts the server's document in the cache and keeps what the person typed: nothing they wrote is lost.
 * - Nothing here says "saved": whether the server stored the change is not the person's to be told twice.
 */
export function useTitleSave(document: DocumentMeta) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const query = documentQuery(dataSource, document.id)
  const [typed, setTyped] = useState<string | null>(null)
  const [problem, setProblem] = useState<TitleProblem | null>(null)

  const save = useMutation({
    scope: { id: `document-title:${document.id}` },
    mutationFn: (title: string) => {
      const { revision } = queryClient.getQueryData(query.queryKey) ?? document
      return dataSource.updateDocument({ params: { path: { documentId: document.id } }, body: { title, revision } })
    },
    onSuccess: (updated, title) => {
      // The response is the next revision to send; the other lists are marked stale and fetched again when read.
      queryClient.setQueryData(query.queryKey, updated)
      const scope = { workspaceId: updated.workspaceId, documentId: updated.id }
      for (const key of keysAfterMutation('updateDocument', scope)) {
        if (key !== query.queryKey) void queryClient.invalidateQueries({ queryKey: key })
      }
      setTyped((current) => (current?.trim() === title ? null : current))
    },
    onError: (error) => {
      const current = isApiError(error, 'revision-conflict') ? currentFromConflict(error) : null
      if (current !== null) {
        queryClient.setQueryData(query.queryKey, current)
        setProblem('conflict')
        setTyped((text) => (text?.trim() === current.title ? null : text))
        return
      }
      setProblem('failed')
      // Not allowed any more, or gone: the document is read again, so the screen shows what is true now.
      if (isApiError(error, 'forbidden') || isApiError(error, 'not-found')) {
        void queryClient.invalidateQueries({ queryKey: query.queryKey })
      }
    },
  })

  function change(next: string) {
    const clipped = clipToCodePoints(next, contractLimits.documentTitle.max)
    setTyped(clipped)
    setProblem(clipped === next ? null : 'tooLong')
  }

  /** Hands the typed title over for saving. It answers `false` when the title is not one that can be saved. */
  function commit(): boolean {
    if (typed === null) return true
    const title = typed.trim()
    if (title === '') {
      setProblem('required')
      return false
    }
    setProblem(null)
    if (title === document.title) setTyped(null)
    else save.mutate(title)
    return true
  }

  return { value: typed ?? document.title, problem, change, commit }
}
