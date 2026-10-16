import { parseDocumentName, type AuthDeniedReason } from '@draftroom/contract/collab'
import type { Extension } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import { findDocumentAccess, roleOf } from '../db/documents/caller-documents.ts'
import type { Database } from '../db/tables.ts'
import type { AuthProvider } from '../http/auth/auth-provider.ts'
import { connectionModeFor } from './connectionMode.ts'
import type { ConnectionContext } from './context.ts'
import type { RevocationMarks } from './inFlight.ts'
import type { CollabLog } from './log.ts'
import { connectionSessionId } from './sessionKey.ts'

export interface AuthenticateOptions {
  readonly database: Kysely<Database>
  readonly authProvider: AuthProvider
  /** Keys the hash that stands for a session id in the connection context. */
  readonly sessionSecret: string
  readonly log: CollabLog
  readonly marks: RevocationMarks
}

/** What the checks decided: the context of the connection, or the reason it is refused. */
type Decision =
  { readonly context: ConnectionContext; readonly readOnly: boolean } | { readonly denied: AuthDeniedReason }

const deny = (denied: AuthDeniedReason): Decision => ({ denied })

/**
 * The checks of protocol §3.3, in order, the first failure ending the process. They return a decision and throw only for
 * a failure of the server, which the caller answers `unavailable`.
 */
async function decide(
  { database, authProvider, sessionSecret }: AuthenticateOptions,
  documentName: string,
  headers: Headers,
  sequence: number,
): Promise<Decision> {
  const documentId = parseDocumentName(documentName)
  if (documentId === null) return deny('not-found')

  const authentication = await authProvider.authenticate(
    { headers: Object.fromEntries(headers.entries()) },
    { csrf: false },
  )
  if (authentication.status !== 'authenticated') return deny('unauthenticated')
  const { userId, sessionId } = authentication.principal

  // One query for the role (the rule REST uses), the archive and the name. A missing document, one of another
  // workspace, no role, and an archived one the person does not own all take this path: ids cannot be probed.
  const access = await findDocumentAccess(database, documentId, userId)
  if (access === undefined) return deny('not-found')
  const role = roleOf(access.record)
  const mode = connectionModeFor({ role, archived: access.record.archived_at !== null })
  if (role === null || mode.access === 'refused') return deny('not-found')

  return {
    readOnly: mode.scope === 'readonly',
    context: {
      userId,
      workspaceId: access.record.workspace_id,
      role,
      // A person who signed up has a name; the empty one is for the type, which allows it for someone who has not.
      displayName: access.personName ?? '',
      sessionId: connectionSessionId(sessionSecret, sessionId),
      sequence,
    },
  }
}

export function authenticateExtension(options: AuthenticateOptions): Extension<ConnectionContext> {
  return {
    extensionName: 'draftroom-authenticate',

    // The identity never comes from `data.token`: the provider sends none, and a server must ignore it. The context this
    // returns is merged into the connection's, and `onLoadDocument` runs only after it, so a refused connection is sent
    // no document data.
    //
    // A refusal is a plain object with a `reason`: it has no `message`, so Hocuspocus does not log it, and it answers the
    // client with `PermissionDenied(reason)`. The socket stays open (F5): the hook cannot reach it, and the client closes it.
    async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
      // Taken before anything is read: a revocation that is left after this ticket reaches this connection even if it is not
      // registered when the revocation looks for it.
      const sequence = options.marks.ticket()
      let decision: Decision
      try {
        decision = await decide(options, documentName, requestHeaders, sequence)
      } catch (error) {
        // Not `not-found`: a client that had access would take that for the removal of it and purge its local copy.
        options.log.error({ documentName, error }, 'authenticating a connection failed')
        options.marks.settle(sequence)
        throw { reason: 'unavailable' satisfies AuthDeniedReason }
      }
      if ('denied' in decision) {
        // Refused: it will not be registered, so nothing a revocation leaves needs to wait for it.
        options.marks.settle(sequence)
        throw { reason: decision.denied }
      }
      connectionConfig.readOnly = decision.readOnly
      return decision.context
    },
  }
}
