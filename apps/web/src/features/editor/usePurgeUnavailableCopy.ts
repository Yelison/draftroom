import { useQuery } from '@tanstack/react-query'
import { purgeCopiesOfDocument, type PurgedDocument } from '../../collab/offlineCache.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from './meQuery.ts'

const nothingKept: PurgedDocument = { hadCopy: false, hadUnstoredChanges: false }

/**
 * The document was asked for with no answer to show, and the API said it is not there: for a person who lost their access
 * while the page was closed, that is the whole of what the device will ever hear, because no session is made to purge the
 * copy (`useCollabSession` does it for a document that was already open). Whatever copy this account keeps of the document
 * is deleted by the module that owns the copies, once it is known whose they are, and what it held is returned so that the
 * screen says the same as for a document that was open: access was removed, and what was never stored was not sent.
 *
 * It is `undefined` until that is known. Where it cannot be known (nobody signed in, or the copies cannot be listed) the
 * person is told what is true of the API's answer alone: nothing is claimed of a copy.
 */
export function usePurgeUnavailableCopy(documentId: string, unavailable: boolean): PurgedDocument | undefined {
  const dataSource = useDataSource()
  const me = useQuery(meQuery(dataSource))
  const userId = me.data?.id
  const purge = useQuery({
    queryKey: ['unavailable-document-copy', userId, documentId],
    // A copy that cannot be deleted now is deleted by the next purge of the account's copies (sign-out, account switch).
    queryFn: () => purgeCopiesOfDocument(userId ?? '', documentId).catch(() => nothingKept),
    enabled: unavailable && userId !== undefined,
    retry: false,
    gcTime: 0,
  })
  if (!unavailable) return undefined
  return me.isError ? nothingKept : purge.data
}
