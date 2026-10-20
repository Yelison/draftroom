/**
 * How the REST routes tell the collaboration server that who can open documents changed, so the connections that are open
 * stop being what the change took away (protocol §6.3). The collaboration server implements it; the routes only know
 * this, as they know `DocumentBroadcaster`, and a test can watch what they say.
 *
 * All of them are called **after** the change is committed, never inside its transaction, and they do not fail: whatever goes wrong
 * is the implementation's to handle, because the change stands and the caller has nothing to undo.
 */
export interface LiveAccess {
  /** Who can open this document, or with what role, may have changed: everyone who has it open is held to it again. */
  documentChanged(documentId: string): Promise<void>
  /**
   * The document was archived: owners' connections are recycled so they reconnect read-only (`4409`), and everyone else's
   * close (`4403`), the notice `document-archived` first (protocol §6.3).
   */
  documentArchived(documentId: string): Promise<void>
  /** The document left the archive: every connection it had (only its owners', read-only) reconnects to be allowed to write (`4409`). */
  documentRestored(documentId: string): Promise<void>
  /** The document was deleted for good: every connection closes with `4403`, with nothing left to explain it. */
  documentDeleted(documentId: string): Promise<void>
  /** This person's role in the workspace changed or they left: their connections in it are held to what they hold now. */
  memberChanged(workspaceId: string, userId: string): Promise<void>
  /** A session ended (sign-out, a new sign-in in its place, expiry): every connection it opened closes with `4401`. */
  sessionEnded(sessionId: string): Promise<void>
}
