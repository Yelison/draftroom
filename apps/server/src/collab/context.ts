import type { DocumentRole } from '../db/tables.ts'

/**
 * What a live connection remembers of the person it belongs to, set by `onAuthenticate` and read by every later hook
 * (protocol §3.3, step 5). It is never sent to a client.
 */
export interface ConnectionContext {
  readonly userId: string
  readonly workspaceId: string
  /** The role the person had when the connection was made: it decides the mode, and a role change closes the connection. */
  readonly role: DocumentRole
  /** The name presence shows for this person, taken from the database and not from what the client says (§5.3). */
  readonly displayName: string
  /** A keyed hash of the session id, or `null` when the identity has no session. It is how a session that ends finds its connections. */
  readonly sessionId: string | null
  /**
   * The ticket this connection took before it read the person's role. A revocation that comes later reaches it even if it
   * was still being established when the revocation looked for connections (see `RevocationMarks`).
   */
  readonly sequence: number
}
