import { documentName, serializeStatelessEvent, type StatelessEvent } from '@draftroom/contract/collab'
import type { Hocuspocus } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'

/**
 * Sends a stateless event to every connection of a document that is open on this server. Only a document somebody has
 * open is in memory, so for any other there is nobody to tell and nothing to do: asking for it through Hocuspocus would
 * load its state from the database and schedule a store, for an event no one would receive. There is no filter, unlike
 * `stored`: a read-only connection has to hear that a comment changed, or a viewer would never see it.
 */
export function broadcastToDocument(
  hocuspocus: Hocuspocus<ConnectionContext>,
  documentId: string,
  event: StatelessEvent,
): void {
  hocuspocus.documents.get(documentName(documentId))?.broadcastStateless(serializeStatelessEvent(event))
}
