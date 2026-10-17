import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { purgeCopiesOfDocument } from '../../collab/offlineCache.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from './meQuery.ts'

/**
 * The document was asked for with no answer to show, and the API said it is not there: for a person who lost their access
 * while the page was closed, that is the whole of what the device will ever hear, because no session is made to purge the
 * copy (`useCollabSession` does it for a document that was already open). Whatever copy this account keeps of the document
 * is deleted by the module that owns the copies, once it is known whose they are.
 */
export function usePurgeUnavailableCopy(documentId: string, unavailable: boolean): void {
  const dataSource = useDataSource()
  const { data: me } = useQuery(meQuery(dataSource))
  const userId = me?.id

  useEffect(() => {
    if (!unavailable || userId === undefined) return
    // A copy that cannot be deleted now is deleted by the next purge of the account's copies (sign-out, account switch).
    purgeCopiesOfDocument(userId, documentId).catch(() => undefined)
  }, [documentId, unavailable, userId])
}
