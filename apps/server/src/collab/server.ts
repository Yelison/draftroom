import { MAX_MESSAGE_BYTES, type StatelessEvent } from '@draftroom/contract/collab'
import { Server, type Hocuspocus } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import type { Config } from '../config.ts'
import type { Database } from '../db/tables.ts'
import type { AuthProvider } from '../http/auth/auth-provider.ts'
import type { LiveDocuments } from '../http/live-documents.ts'
import { authenticateExtension } from './authenticate.ts'
import { createAutoVersions } from './autoVersions.ts'
import { awarenessGuardExtension } from './awarenessGuard.ts'
import { endConnections, tellConnections, type ClosePlan, type ConnectionSelector } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import { inFlightExtension, RevocationMarks } from './inFlight.ts'
import { DurabilityRegistry } from './durability.ts'
import { durableAckExtension } from './durableAck.ts'
import { createExcerptUpdates, createPostgresExcerptWriter, type ExcerptWriter } from './excerpt.ts'
import { limitsExtension } from './limits.ts'
import { broadcastToDocument } from './broadcastToDocument.ts'
import { createLiveDocuments } from './liveDocuments.ts'
import type { CollabLog } from './log.ts'
import { OpenSockets } from './openSockets.ts'
import { persistenceExtension } from './persistence.ts'
import { postgresRestoreVersions, type RestoreVersions } from './restoreVersions.ts'
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
  /** Where the excerpt of a document is written after a store; PostgreSQL unless a test needs a writer that is slow or fails. */
  readonly excerpts?: ExcerptWriter
  /** What a restore keeps in the database; PostgreSQL unless a test needs one that is slow or fails. */
  readonly restoreVersions?: RestoreVersions
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
  /**
   * The procedure of protocol §6.3 for the connections that match; it says how many it ended.
   *
   * **Call it after the change is committed to the database, never inside the transaction that makes it.** A connection
   * that is still being established has read the person's role already and is not live, so it is not among the ones ended:
   * it is reached by a mark this call leaves, which names it only if it took its ticket before the mark. A connection that
   * takes its ticket after the mark is taken to have read the database after the change; that is true only once the
   * change is committed (the database reads committed data), and a call made before the commit would let it read the old
   * role and be established with it.
   */
  endConnections(target: ConnectionTarget, plan: ClosePlan): number
  /** Sends a stateless event to the live connections that match, with the selector of `endConnections`. It says how many it reached. */
  tell(target: ConnectionTarget, event: StatelessEvent): number
  /** The work REST does on documents that people may have open: the state a version is saved from, and the restore. */
  readonly documents: LiveDocuments
  /** Looks for documents that are due an automatic version now and makes them, and says how many it made. It also runs on its own, on an interval. */
  sweepAutoVersions(): Promise<number>
  /** Stores what can be stored, within the wait of protocol §7.2, and stops. */
  shutDown(): Promise<void>
  readonly hocuspocus: Hocuspocus<ConnectionContext>
}

// Protocol §3.1: the options Hocuspocus is configured with.
const unauthenticatedQueueBytes = 256 * 1024
const unauthenticatedQueueMessages = 64
const connectionTimeoutMs = 30_000
/** A connection that has not been registered after this long is taken for dead by the marks of a revocation. */
const stuckConnectionMs = 10 * 60 * 1000
/** A socket carries one document (protocol §2): the server refuses to hold more names open before authentication. */
const pendingDocuments = 2

export function createCollabServer(options: CollabServerOptions): CollabServer {
  const { config, database, authProvider, log } = options
  const timing = options.timing ?? productionTiming
  const store = options.store ?? createPostgresStateStore(database)
  const now = options.now ?? Date.now

  const durability = new DurabilityRegistry(now)
  const retry = new StoreRetry(timing.retryDelaysMs, log)
  const sockets = new OpenSockets()
  const marks = new RevocationMarks(stuckConnectionMs, now)
  const excerpts = createExcerptUpdates(options.excerpts ?? createPostgresExcerptWriter(database), log)

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
      authenticateExtension({ database, authProvider, sessionSecret: config.sessionSecret, log, marks }),
      persistenceExtension({ store, durability, retry, marks, excerpts, log }),
      // Before the acknowledgement: a connection that a revocation names is closed before it is told anything is stored.
      inFlightExtension(marks),
      durableAckExtension({ durability, log }),
      limitsExtension({ durability, now }),
      awarenessGuardExtension(),
    ],
  })

  const documents = createLiveDocuments({
    hocuspocus: server.hocuspocus,
    database,
    store,
    durability,
    retry,
    versions: options.restoreVersions ?? postgresRestoreVersions(database),
    log,
  })

  const autoVersions = createAutoVersions({
    database,
    documents,
    durability,
    broadcast: (documentId, event) => broadcastToDocument(server.hocuspocus, documentId, event),
    log,
    now,
  })

  return {
    hocuspocus: server.hocuspocus,
    documents,
    sweepAutoVersions: autoVersions.sweep,

    async listen() {
      await server.listen()
      autoVersions.start(timing.autoVersionSweepMs)
      return server.address.port
    },

    endConnections({ sessionId, ...target }, plan) {
      const selector: ConnectionSelector =
        sessionId === undefined ? target : { ...target, sessionId: sessionKey(config.sessionSecret, sessionId) }
      const ended = endConnections(server.hocuspocus, selector, plan)
      // For the connections that are being established and so not live yet; the selector was valid, or this was not reached.
      marks.leave(selector, plan)
      return ended
    },

    tell({ sessionId, ...target }, event) {
      const selector: ConnectionSelector =
        sessionId === undefined ? target : { ...target, sessionId: sessionKey(config.sessionSecret, sessionId) }
      return tellConnections(server.hocuspocus, selector, event)
    },

    shutDown() {
      autoVersions.stop()
      return shutDownCollaboration({ server, durability, retry, excerpts, sockets, timing, log })
    },
  }
}
