import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { purgeCopiesOfDocument, type PurgedDocument } from '../../collab/offlineCache.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { retryTransportOnce } from '../documents/queries.ts'
import { meQuery } from './meQuery.ts'

const nothingKept: PurgedDocument = { hadCopy: false, hadUnstoredChanges: false }

/**
 * The document was asked for with no answer to show, and the API said it is not there: for a person who lost their access
 * while the page was closed, that is the whole of what the device will ever hear, because no session is made to purge the
 * copy (`useCollabSession` does it for a document that was already open). Whatever copy this account keeps of the document
 * is deleted by the module that owns the copies, once it is known whose they are, and what it held is returned so that the
 * screen says the same as for a document that was open: access was removed, and what was never stored was not sent.
 *
 * A deletion is not a query: it is done once, and what it found is what it is. Asking again (a refocus, a reconnection) would
 * find nothing, because the first call deleted it, and the screen would change its mind about what the person lost. So it is
 * a single shot, started once the account is known, and its result lasts while the screen is shown for this document.
 *
 * It is `undefined` until that is known. Where it cannot be known (nobody signed in, or the copies cannot be listed) the
 * person is told what is true of the API's answer alone: nothing is claimed of a copy.
 */
export function usePurgeUnavailableCopy(documentId: string, unavailable: boolean): PurgedDocument | undefined {
  const dataSource = useDataSource()
  // The same question as the session gate asks, answered the same way: an unsigned person must reach sign-in without waiting
  // for retries this observer would add.
  const me = useQuery({ ...meQuery(dataSource), retry: retryTransportOnce })
  const userId = me.data?.id
  const purge = useMutation({
    mutationFn: ({ userId, documentId }: { userId: string; documentId: string }) =>
      // A copy that cannot be deleted now is deleted by the next purge of the account's copies (sign-out, account switch).
      purgeCopiesOfDocument(userId, documentId).catch(() => nothingKept),
  })
  const { mutate } = purge
  // The effect can run again for the same account and document (StrictMode, a refusal that goes and comes back): a second
  // purge would delete nothing and replace what the first one found, so the reference is what stops it.
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!unavailable || userId === undefined || started.current === `${userId}:${documentId}`) return
    started.current = `${userId}:${documentId}`
    mutate({ userId, documentId })
  }, [unavailable, userId, documentId, mutate])

  if (!unavailable) return undefined
  if (me.isError) return nothingKept
  // What a previous document, or another account, found is not this one's: the same key as the one that starts it.
  return purge.variables?.userId === userId && purge.variables?.documentId === documentId ? purge.data : undefined
}
