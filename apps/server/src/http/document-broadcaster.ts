import type { StatelessEvent } from '@draftroom/contract/collab'

/**
 * How the REST routes tell the people who have a document open that something about it changed (protocol §9). The
 * collaboration server implements it; the routes only know this, so they run with no WebSocket and a test can watch what
 * they say. The event goes to every connection of the document, read-only ones included, so it never holds anything a
 * viewer may not read.
 */
export interface DocumentBroadcaster {
  /** Tells the connections of one document. Nobody being connected is not an error: there is nobody to tell. */
  broadcast(documentId: string, event: StatelessEvent): void
}
