import type { Server } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'
import { storeNow, type StoreRetry } from './storeRetry.ts'

/** Resolves when the work does or when `ms` have passed, whichever is first; the timer never outlives it. */
async function withinDeadline(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([work, deadline])
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
  waitMs,
}: {
  readonly server: Server<ConnectionContext>
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly waitMs: number
}): Promise<void> {
  server.httpServer.close()
  const { hocuspocus } = server
  const unconfirmed = [...hocuspocus.documents.values()].filter(
    (document) => durability.get(document.name)?.unconfirmed,
  )

  // The attempts below replace the waiting retries, which would otherwise run a second store of the same state.
  retry.cancelAll()
  await withinDeadline(Promise.all(unconfirmed.map((document) => storeNow(hocuspocus, document))), waitMs)

  // From here a document is no longer kept in memory for its unconfirmed changes: nothing will ever store them, and
  // `destroy()` would wait for ever for an unload that the guard keeps refusing.
  durability.beginShutdown()
  retry.cancelAll()
  for (const document of hocuspocus.documents.values()) {
    if (document.getConnectionsCount() === 0) await hocuspocus.unloadDocument(document)
  }
  await server.destroy()
}
