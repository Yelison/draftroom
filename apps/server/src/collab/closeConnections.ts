import {
  CLOSE_CODES,
  serializeStatelessEvent,
  documentName,
  type CloseCodeName,
  type StatelessEvent,
} from '@draftroom/contract/collab'
import type { Connection, Hocuspocus } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'

// How the server ends a live connection (protocol §6). `Connection.close` would not do: it sends an in-band message
// with the reason text, the provider reports it as code 1000 and does not reconnect, so the numeric code would never
// reach the client. The server closes the WebSocket itself, which is why a socket carries one document (§2).

export interface ClosePlan {
  /** The code, by name; the close frame carries the name as its reason. */
  readonly code: CloseCodeName
  /** The stateless event that explains the change, sent first: `ws` delivers frames in order, so it arrives before the close. */
  readonly event?: StatelessEvent
}

/**
 * The procedure of §6.3 for one connection. The read-only flag flips first and synchronously, before anything is
 * awaited, so from that instant the connection cannot write although the close frame is still on its way.
 */
export function endConnection(connection: Connection<ConnectionContext>, { code, event }: ClosePlan): void {
  connection.readOnly = true
  if (event !== undefined) connection.sendStateless(serializeStatelessEvent(event))
  connection.webSocket.close(CLOSE_CODES[code], code)
}

/** Which connections: all the conditions given must hold, and at least one has to be given so nobody closes everything by accident. */
export interface ConnectionSelector {
  readonly documentId?: string
  readonly userId?: string
  /** The keyed hash kept in the connection context, not the session id itself. */
  readonly sessionId?: string
  /** For the cases that split people, such as the owners and the others of a document that is archived. */
  readonly where?: (context: ConnectionContext) => boolean
}

const hasCondition = ({ documentId, userId, sessionId, where }: ConnectionSelector): boolean =>
  documentId !== undefined || userId !== undefined || sessionId !== undefined || where !== undefined

/**
 * Ends every live connection the selector matches, and says how many it ended. It is the function T4.1 (revocation) and
 * T7.1 (the end of a session) call; it decides nothing about who should be closed.
 */
export function endConnections(
  instance: Hocuspocus<ConnectionContext>,
  selector: ConnectionSelector,
  plan: ClosePlan,
): number {
  if (!hasCondition(selector)) throw new RangeError('Closing connections needs at least one condition')
  const only = selector.documentId === undefined ? undefined : documentName(selector.documentId)
  let ended = 0
  for (const document of instance.documents.values()) {
    if (only !== undefined && document.name !== only) continue
    for (const connection of document.getConnections() as Connection<ConnectionContext>[]) {
      const { context } = connection
      if (selector.userId !== undefined && context.userId !== selector.userId) continue
      // A connection without a session never matches one: two absences are not the same session.
      if (selector.sessionId !== undefined && context.sessionId !== selector.sessionId) continue
      if (selector.where !== undefined && !selector.where(context)) continue
      endConnection(connection, plan)
      ended += 1
    }
  }
  return ended
}
