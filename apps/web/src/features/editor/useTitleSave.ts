import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { isApiError, type ApiError } from '../../data/errors.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { clipToCodePoints } from './clipToCodePoints.ts'
import { documentQuery } from './documentQuery.ts'

type DocumentMeta = Schema<'Document'>

/** What went wrong with the title, which the field says next to itself. */
export type TitleProblem = 'required' | 'tooLong' | 'conflict' | 'failed'

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
 * - What the person types is saved against the revision they started from, which only their own saves move on: a rename
 *   by someone else that arrives while they type refreshes the document, but it must not be overwritten without the
 *   person being told (`metadata-changed` exists for that, protocol section 9).
 * - Saves are queued by the mutation's `scope`, and each reads that revision when it runs, after the save before it has
 *   moved it on, so two quick saves never send the same revision (which the second would lose to the first).
 * - A `409` that finds the title as the person started from it (someone only moved the document) is not a conflict of
 *   titles: the save is made again once, from that revision, and the person is told nothing.
 * - A `409` over the title puts the server's document in the cache and keeps what the person typed: nothing they wrote is lost. Typing
 *   is then from the server's revision, so pressing Enter again is a choice to replace the other title.
 * - Nothing here says "saved": whether the server stored the change is not the person's to be told twice.
 */
export function useTitleSave(document: DocumentMeta) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const query = documentQuery(dataSource, document.id)
  const [typed, setTyped] = useState<string | null>(null)
  const [problem, setProblem] = useState<TitleProblem | null>(null)
  // What the typed title is a change to, the revision and the title it started from: read from the cache when typing
  // starts, then moved by the saves and the conflicts of this field alone. A ref, because no render depends on it.
  const base = useRef<{ revision: number; title: string } | null>(null)

  const save = useMutation({
    scope: { id: `document-title:${document.id}` },
    mutationFn: async (title: string) => {
      const from = base.current ?? queryClient.getQueryData(query.queryKey) ?? document
      const update = (revision: number) =>
        dataSource.updateDocument({ params: { path: { documentId: document.id } }, body: { title, revision } })
      try {
        return await update(from.revision)
      } catch (error) {
        const current = isApiError(error, 'revision-conflict') ? currentFromConflict(error) : null
        // Someone changed something else (moved the document): there is no title to choose between, so go on from theirs.
        if (current?.title === from.title) return update(current.revision)
        throw error
      }
    },
    onSuccess: (updated, title) => {
      // The response is the next revision to send; the other lists are marked stale and fetched again when read.
      queryClient.setQueryData(query.queryKey, updated)
      base.current = { revision: updated.revision, title: updated.title }
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
        base.current = { revision: current.revision, title: current.title }
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
    if (typed === null) {
      const { revision, title } = queryClient.getQueryData(query.queryKey) ?? document
      base.current = { revision, title }
    }
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
