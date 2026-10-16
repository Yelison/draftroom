import type { Server } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'
import { storeNow, type StoreRetry } from './storeRetry.ts'
import type { OpenSockets } from './openSockets.ts'
import type { CollabTiming } from './timing.ts'

/** The WebSocket close code for an endpoint that is going away, such as a server that shuts down (RFC 6455, 7.4.1). */
const GOING_AWAY = 1001

/** Says whether the work finished within `ms`; the timer never outlives the answer. */
async function finishesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  try {
    return await Promise.race([work.then(() => true), deadline])
  } finally {
    clearTimeout(timer)
  }
}

/** Resolves after `ms`, or at once when the signal is aborted: the timer never outlives either. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}

/**
 * Tries every document whose write is not confirmed, at once and then again after each wait of the retry's back-off,
 * until all are confirmed or the signal says the time is up. A write that fails resolves quickly, so a single attempt
 * would give up on a database that comes back a moment later: the point of the wait is to keep trying within it.
 */
async function storeUntilConfirmed({
  hocuspocus,
  durability,
  retry,
  delays,
  signal,
}: {
  readonly hocuspocus: Server<ConnectionContext>['hocuspocus']
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly delays: readonly number[]
  readonly signal: AbortSignal
}): Promise<void> {
  const unconfirmed = () =>
    [...hocuspocus.documents.values()].filter((document) => durability.get(document.name)?.unconfirmed)
  for (let round = 0; !signal.aborted; round += 1) {
    const pending = unconfirmed()
    if (pending.length === 0) return
    // The attempts below replace the retries that were waiting, which would otherwise store the same state a second time.
    retry.cancelAll()
    await Promise.all(pending.map((document) => storeNow(hocuspocus, document)))
    if (unconfirmed().length === 0) return
    await pause(delays[Math.min(round, delays.length - 1)] ?? 0, signal)
  }
}

/**
 * The orderly shutdown (protocol §7.2, step 4; ADR 0006): stop accepting connections, try every document whose write has
 * not been confirmed, again and again, for at most `shutdownWaitMs`, and then let `destroy()` close the connections and
 * unload what is left. A document that still could not be stored is logged as it is unloaded, and its clients keep their
 * pending changes.
 */
export async function shutDownCollaboration({
  server,
  durability,
  retry,
  sockets,
  timing,
  log,
}: {
  readonly server: Server<ConnectionContext>
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly sockets: OpenSockets
  readonly timing: Pick<CollabTiming, 'shutdownWaitMs' | 'shutdownGraceMs' | 'socketCloseMs' | 'retryDelaysMs'>
  readonly log: CollabLog
}): Promise<void> {
  server.httpServer.close()
  const { hocuspocus } = server
  const timeUp = new AbortController()
  await finishesWithin(
    storeUntilConfirmed({ hocuspocus, durability, retry, delays: timing.retryDelaysMs, signal: timeUp.signal }),
    timing.shutdownWaitMs,
  )
  timeUp.abort()

  // From here a document is no longer kept in memory for its unconfirmed changes: nothing will ever store them, and
  // `destroy()` would wait for ever for an unload that the guard keeps refusing.
  durability.beginShutdown()
  retry.cancelAll()
  for (const document of hocuspocus.documents.values()) {
    if (document.getConnectionsCount() === 0) await hocuspocus.unloadDocument(document)
  }
  // `destroy()` ends every document connection in band and leaves the sockets open, and an open socket keeps the process
  // alive: it would not exit after its shutdown. The sockets are taken before `destroy()` forgets the connections, and
  // closed with the code for a server that is going away, which a client treats as a lost connection and answers by
  // reconnecting to whoever is serving next.
  const established = [...hocuspocus.documents.values()].flatMap((document) =>
    document.getConnections().map((connection) => connection.webSocket),
  )
  // A write that hangs (a database that stopped answering) holds the document's mutex, and a document that is being written
  // is never unloaded, so `destroy()` would wait for it for ever. The process is leaving: it waits a little, and says so.
  if (!(await finishesWithin(server.destroy(), timing.shutdownGraceMs))) {
    log.error(
      { documents: [...hocuspocus.documents.keys()] },
      'shutting down with documents that are still being written',
    )
  }
  for (const socket of established) socket.close(GOING_AWAY, 'going-away')
  // The ones with no document, which nobody can ask to close, and any that does not answer, are destroyed.
  await sockets.closeAll(timing.socketCloseMs)
}
