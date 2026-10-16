import type { StatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { factsOfDocument, factsOfMember, type AccessFacts } from '../db/access/queries.ts'
import type { Database } from '../db/tables.ts'
import { closureFor, type Closure, type ConnectionAccess } from '../domain/access.ts'
import { effectiveRole } from '../domain/permissions.ts'
import type { DocumentBroadcaster } from '../http/document-broadcaster.ts'
import type { LiveAccess } from '../http/live-access.ts'
import { connectionModeFor } from './connectionMode.ts'
import type { ConnectionContext } from './context.ts'
import type { CollabLog } from './log.ts'
import type { CollabServer, ConnectionTarget } from './server.ts'

// What a change of access does to the connections that are open (protocol §6.3). The routes call this after the change is
// committed, and it holds every connection the change could reach to what the database says the person has now: a
// connection stays only if its mode is still the person's, and otherwise it is closed with `4403` (no role) or `4409`
// (the mode flips, either way). It decides from a fresh read, not from what the change thought it did, so two changes that
// commit at the same moment and each missed the other are both seen by the one that finishes last.

/** Where the facts come from. A function of the database, apart so that the decisions can be tested without one. */
export interface AccessFactsSource {
  ofDocument(documentId: string): Promise<readonly AccessFacts[]>
  ofMember(workspaceId: string, userId: string): Promise<readonly AccessFacts[]>
}

export const factsFromDatabase = (database: Kysely<Database>): AccessFactsSource => ({
  ofDocument: (documentId) => factsOfDocument(database, documentId),
  ofMember: (workspaceId, userId) => factsOfMember(database, workspaceId, userId),
})

export interface RevocationOptions {
  readonly facts: AccessFactsSource
  readonly collaboration: Pick<CollabServer, 'endConnections'>
  /** Tells the connections of a document that its access changed. */
  readonly broadcaster: DocumentBroadcaster
  readonly log: CollabLog
}

const keyOf = (documentId: string, userId: string): string => `${documentId}:${userId}`

/** What the connection of a person with this role could do, on a document that is or is not archived. */
function accessOf(role: ConnectionContext['role'] | null, archived: boolean): ConnectionAccess {
  const mode = connectionModeFor({ role, archived })
  return mode.access === 'refused' ? 'refused' : mode.scope
}

/**
 * How each connection ends, by the facts at the moment they were read. A person with no facts is not in the workspace
 * (or the document is gone), so nothing is left for them to open.
 */
function closureOf(facts: readonly AccessFacts[]) {
  const byPersonAndDocument = new Map(facts.map((row) => [keyOf(row.documentId, row.userId), row]))
  return ({ role, userId }: ConnectionContext, documentId: string): Closure | null => {
    const now = byPersonAndDocument.get(keyOf(documentId, userId))
    const archived = now?.archived ?? false
    return closureFor(accessOf(role, archived), now === undefined ? 'refused' : accessOf(effectiveRole(now), archived))
  }
}

const closures: readonly Closure[] = ['access-revoked', 'role-changed']

type Decide = ReturnType<typeof closureOf>

export function createLiveAccess({ facts, collaboration, broadcaster, log }: RevocationOptions): LiveAccess {
  /** Ends the connections of the target that `decide` says end with each code, or all of them with `role-changed` when it cannot say. */
  function hold(target: ConnectionTarget, decide: Decide | undefined, event?: StatelessEvent): void {
    const explained = event === undefined ? {} : { event }
    if (decide === undefined) {
      // Not knowing is not a reason to leave a connection as it was: every one reconnects, and authentication decides.
      collaboration.endConnections(target, { code: 'role-changed', ...explained })
      return
    }
    for (const code of closures) {
      const within = target.where ?? (() => true)
      collaboration.endConnections(
        { ...target, where: (context, id) => within(context, id) && decide(context, id) === code },
        { code, ...explained },
      )
    }
  }

  return {
    async documentChanged(documentId) {
      let decide: Decide | undefined
      try {
        decide = closureOf(await facts.ofDocument(documentId))
      } catch (error) {
        log.error({ documentId, error }, 'the access of a document could not be read after a change')
      }
      // The notice goes to everyone who has the document open before any of them is closed: the frames of a socket arrive
      // in order, so the ones about to close hear what happened and the ones that stay refresh what they show.
      broadcaster.broadcast(documentId, { type: 'access-changed' })
      hold({ documentId }, decide)
    },

    async memberChanged(workspaceId, userId) {
      let decide: Decide | undefined
      try {
        decide = closureOf(await facts.ofMember(workspaceId, userId))
      } catch (error) {
        log.error({ workspaceId, userId, error }, 'the access of a member could not be read after a change')
      }
      hold({ userId, where: (context) => context.workspaceId === workspaceId }, decide, { type: 'access-changed' })
    },
  }
}
