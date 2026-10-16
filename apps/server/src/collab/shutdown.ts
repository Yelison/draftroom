import type { Server } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'
import { storeNow, type StoreRetry } from './storeRetry.ts'
import type { CollabTiming } from './timing.ts'

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

/**
 * The orderly shutdown (protocol §7.2, step 4; ADR 0006): stop accepting connections, try again at once every document
 * whose write has not been confirmed (a retry waiting its back-off included), wait for them for at most `waitMs`, and
 * then let `destroy()` close the connections and unload what is left. A document that still could not be stored is logged
 * as it is unloaded, and its clients keep their pending changes.
 */
export async function shutDownCollaboration({
  server,
  durability,
  retry,
  timing,
  log,
}: {
  readonly server: Server<ConnectionContext>
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly timing: Pick<CollabTiming, 'shutdownWaitMs' | 'shutdownGraceMs'>
  readonly log: CollabLog
}): Promise<void> {
  server.httpServer.close()
  const { hocuspocus } = server
  const unconfirmed = [...hocuspocus.documents.values()].filter(
    (document) => durability.get(document.name)?.unconfirmed,
  )

  // The attempts below replace the waiting retries, which would otherwise run a second store of the same state.
  retry.cancelAll()
  await finishesWithin(
    Promise.all(unconfirmed.map((document) => storeNow(hocuspocus, document))),
    timing.shutdownWaitMs,
  )

  // From here a document is no longer kept in memory for its unconfirmed changes: nothing will ever store them, and
  // `destroy()` would wait for ever for an unload that the guard keeps refusing.
  durability.beginShutdown()
  retry.cancelAll()
  for (const document of hocuspocus.documents.values()) {
    if (document.getConnectionsCount() === 0) await hocuspocus.unloadDocument(document)
  }
  // A write that hangs (a database that stopped answering) holds the document's mutex, and a document that is being written
  // is never unloaded, so `destroy()` would wait for it for ever. The process is leaving: it waits a little, and says so.
  if (!(await finishesWithin(server.destroy(), timing.shutdownGraceMs))) {
    log.error(
      { documents: [...hocuspocus.documents.keys()] },
      'shutting down with documents that are still being written',
    )
  }
}
