import { MAX_MESSAGE_BYTES } from '@draftroom/contract/collab'
import { Server, type Hocuspocus } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import type { Config } from '../config.ts'
import type { Database } from '../db/tables.ts'
import type { AuthProvider } from '../http/auth/auth-provider.ts'
import { authenticateExtension } from './authenticate.ts'
import { awarenessGuardExtension } from './awarenessGuard.ts'
import { endConnections, type ClosePlan, type ConnectionSelector } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import { DurabilityRegistry } from './durability.ts'
import { durableAckExtension } from './durableAck.ts'
import { limitsExtension } from './limits.ts'
import type { CollabLog } from './log.ts'
import { OpenSockets } from './openSockets.ts'
import { persistenceExtension } from './persistence.ts'
import { sessionKey } from './sessionKey.ts'
import { shutDownCollaboration } from './shutdown.ts'
import { createPostgresStateStore, type StateStore } from './stateStore.ts'
import { StoreRetry } from './storeRetry.ts'
import { productionTiming, type CollabTiming } from './timing.ts'
import { upgradeGuardExtension } from './upgradeGuard.ts'

/** What the collaboration server takes of the configuration of the process. */
export type CollabConfig = Pick<Config, 'collabPort' | 'allowedOrigins' | 'devIdentity' | 'sessionSecret'> & {
  readonly host: string
}

export interface CollabServerOptions {
  readonly config: CollabConfig
  readonly database: Kysely<Database>
  /** The same boundary REST uses, so a person is the same person on both doors. */
  readonly authProvider: AuthProvider
  readonly log: CollabLog
  /** Where the Yjs state lives; PostgreSQL unless a test needs a store that fails. */
  readonly store?: StateStore
  readonly timing?: CollabTiming
  /** The clock of the rate limit. */
  readonly now?: () => number
}

/** Which live connections, as T4.1 and T7.1 know them: by person, document or the session id itself. */
export interface ConnectionTarget extends Omit<ConnectionSelector, 'sessionId'> {
  readonly sessionId?: string
}

export interface CollabServer {
  /** Starts listening, and gives the port (the one asked for, or the one the system chose for port 0). */
  listen(): Promise<number>
  /** The procedure of protocol §6.3 for the connections that match; it says how many it ended. */
  endConnections(target: ConnectionTarget, plan: ClosePlan): number
  /** Stores what can be stored, within the wait of protocol §7.2, and stops. */
  shutDown(): Promise<void>
  readonly hocuspocus: Hocuspocus<ConnectionContext>
}

// Protocol §3.1: the options Hocuspocus is configured with.
const unauthenticatedQueueBytes = 256 * 1024
const unauthenticatedQueueMessages = 64
const connectionTimeoutMs = 30_000
/** A socket carries one document (protocol §2): the server refuses to hold more names open before authentication. */
const pendingDocuments = 2

export function createCollabServer(options: CollabServerOptions): CollabServer {
  const { config, database, authProvider, log } = options
  const timing = options.timing ?? productionTiming
  const store = options.store ?? createPostgresStateStore(database)
  const now = options.now ?? Date.now

  const durability = new DurabilityRegistry()
  const retry = new StoreRetry(timing.retryDelaysMs, log)
  const sockets = new OpenSockets()

  const server = new Server<ConnectionContext>({
    port: config.collabPort,
    address: config.host,
    quiet: true,
    // The process owns its signals: Hocuspocus's own handler would exit without the wait of the shutdown below.
    stopOnSignals: false,
    timeout: connectionTimeoutMs,
    debounce: timing.debounceMs,
    maxDebounce: timing.maxDebounceMs,
    maxUnauthenticatedQueueSize: unauthenticatedQueueBytes,
    maxUnauthenticatedQueueMessages: unauthenticatedQueueMessages,
    maxPendingDocuments: pendingDocuments,
    // `ws` refuses a larger message itself and closes the socket with 1009 (F7).
    websocketOptions: { maxPayload: MAX_MESSAGE_BYTES },
    // Versions are full updates because the documents are garbage collected (protocol §11).
    yDocOptions: { gc: true, gcFilter: () => true },
    extensions: [
      upgradeGuardExtension({ allowedOrigins: config.allowedOrigins, development: config.devIdentity }, sockets),
      authenticateExtension({ database, authProvider, sessionSecret: config.sessionSecret }),
      persistenceExtension({ store, durability, retry, log }),
      durableAckExtension({ durability, log }),
      limitsExtension({ durability, now }),
      awarenessGuardExtension(),
    ],
  })

  return {
    hocuspocus: server.hocuspocus,

    async listen() {
      await server.listen()
      return server.address.port
    },

    endConnections({ sessionId, ...target }, plan) {
      const selector: ConnectionSelector =
        sessionId === undefined ? target : { ...target, sessionId: sessionKey(config.sessionSecret, sessionId) }
      return endConnections(server.hocuspocus, selector, plan)
    },

    shutDown: () => shutDownCollaboration({ server, durability, retry, sockets, timing, log }),
  }
}
