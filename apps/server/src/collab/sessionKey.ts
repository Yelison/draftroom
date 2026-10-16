import { createHmac } from 'node:crypto'

/** The keyed hash that stands for a session id: the context and the logs never carry a value that could be used as the session. */
export const sessionKey = (secret: string, sessionId: string): string =>
  createHmac('sha256', secret).update(sessionId).digest('hex')

/** What a connection holds in place of its session id (protocol §3.3), or `null` when the identity has no session, which matches nothing. */
export const connectionSessionId = (secret: string, sessionId: string | undefined): string | null =>
  sessionId === undefined ? null : sessionKey(secret, sessionId)
