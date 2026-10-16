import { parseDocumentName, type AuthDeniedReason } from '@draftroom/contract/collab'
import type { Extension } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import { findDocumentAccess, roleOf } from '../db/documents/caller-documents.ts'
import type { Database } from '../db/tables.ts'
import type { AuthProvider } from '../http/auth/auth-provider.ts'
import { connectionModeFor } from './connectionMode.ts'
import type { ConnectionContext } from './context.ts'
import { connectionSessionId } from './sessionKey.ts'

export interface AuthenticateOptions {
  readonly database: Kysely<Database>
  readonly authProvider: AuthProvider
  /** Keys the hash that stands for a session id in the connection context. */
  readonly sessionSecret: string
}

/**
 * A refusal is a plain object with a `reason`: it has no `message`, so Hocuspocus does not log it, and it answers the
 * client with `PermissionDenied(reason)`. The socket stays open (F5): the hook cannot reach it, and the client closes it.
 */
function refuse(reason: AuthDeniedReason): never {
  throw { reason }
}

/** The checks of protocol §3.3, in order, the first failure ending the process. */
export function authenticateExtension({
  database,
  authProvider,
  sessionSecret,
}: AuthenticateOptions): Extension<ConnectionContext> {
  return {
    extensionName: 'draftroom-authenticate',

    // The identity never comes from `data.token`: the provider sends none, and a server must ignore it. The context this
    // returns is merged into the connection's, and `onLoadDocument` runs only after it, so a refused connection is sent
    // no document data.
    async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
      const documentId = parseDocumentName(documentName)
      if (documentId === null) return refuse('not-found')

      const authentication = await authProvider.authenticate(
        { headers: Object.fromEntries(requestHeaders.entries()) },
        { csrf: false },
      )
      if (authentication.status !== 'authenticated') return refuse('unauthenticated')
      const { userId, sessionId } = authentication.principal

      // One query for the role (the rule REST uses), the archive and the name. A missing document, one of another
      // workspace, no role, and an archived one the person does not own all take this path: ids cannot be probed.
      const access = await findDocumentAccess(database, documentId, userId)
      if (access === undefined) return refuse('not-found')
      const role = roleOf(access.record)
      const mode = connectionModeFor({ role, archived: access.record.archived_at !== null })
      if (role === null || mode.access === 'refused') return refuse('not-found')

      connectionConfig.readOnly = mode.scope === 'readonly'
      const context: ConnectionContext = {
        userId,
        workspaceId: access.record.workspace_id,
        role,
        // A person who signed up has a name; the empty one is for the type, which allows it for someone who has not.
        displayName: access.personName ?? '',
        sessionId: connectionSessionId(sessionSecret, sessionId),
      }
      return context
    },
  }
}
