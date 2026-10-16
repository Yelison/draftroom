/**
 * How the REST routes tell the collaboration server that who can open documents changed, so the connections that are open
 * stop being what the change took away (protocol §6.3). The collaboration server implements it; the routes only know
 * this, as they know `DocumentBroadcaster`, and a test can watch what they say.
 *
 * Both are called **after** the change is committed, never inside its transaction, and they do not fail: whatever goes wrong
 * is the implementation's to handle, because the change stands and the caller has nothing to undo.
 */
export interface LiveAccess {
  /** Who can open this document, or with what role, may have changed: everyone who has it open is held to it again. */
  documentChanged(documentId: string): Promise<void>
  /** This person's role in the workspace changed or they left: their connections in it are held to what they hold now. */
  memberChanged(workspaceId: string, userId: string): Promise<void>
}
