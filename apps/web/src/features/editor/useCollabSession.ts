import type { Schema } from '@draftroom/contract'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { CollabSession } from '../../collab/session.ts'
import { keysAfterEvent } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'

/**
 * The live connection to the document that is open: made when the screen is shown and ended when it is left, one for each
 * opening. It is `null` for the first render, until the screen has mounted.
 *
 * It is made in an effect, not while rendering. Ending a session closes its connection, and StrictMode runs every effect,
 * its cleanup and the effect again: a session made while rendering would be ended by that cleanup and handed on dead.
 * What other people change in the document (its title, who may open it, comments, versions) arrives as events of the
 * connection, and each makes stale exactly the queries the protocol says it does.
 */
export function useCollabSession(document: Schema<'Document'>): CollabSession | null {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<CollabSession | null>(null)
  const { id: documentId, workspaceId } = document

  useEffect(() => {
    const opened = dataSource.openDocument(documentId)
    const stopListening = opened.onServerEvent((event) => {
      if (event.type === 'stored' || event.type === 'document-too-large') return
      for (const queryKey of keysAfterEvent(event.type, { workspaceId, documentId })) {
        void queryClient.invalidateQueries({ queryKey })
      }
    })
    // The state is the way this effect hands an external resource to the render, which is the case a setState in an effect
    // is for: the session cannot be made while rendering, for the reason above.
    // oxlint-disable-next-line react/set-state-in-effect
    setSession(opened)
    return () => {
      stopListening()
      opened.destroy()
    }
  }, [dataSource, documentId, workspaceId, queryClient])

  return session
}
