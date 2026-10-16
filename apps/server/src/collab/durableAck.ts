import { serializeStatelessEvent } from '@draftroom/contract/collab'
import type { Extension } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'

// "Synced" means the server stored the change (protocol §7, ADR 0006). This is the half of that rule the server tells
// the clients: after each durable write, and when a client connects, a `stored` event carrying the snapshot of what is in
// the database. Only writable connections get it, because a reader needs no acknowledgement.

/** Thrown to keep a document loaded: it has no message, so Hocuspocus does not log it each time. */
const keepLoaded = Object.freeze({ reason: 'the document has changes that are not stored' })

export function durableAckExtension({
  durability,
  log,
}: {
  readonly durability: DurabilityRegistry
  readonly log: CollabLog
}): Extension<ConnectionContext> {
  return {
    extensionName: 'draftroom-durable-ack',

    // Runs only after a write that committed, inside the same mutex as the write. It sends the snapshot the write captured
    // and never computes a new one: an update applied while the write was in flight is acknowledged to its author, but
    // is not stored yet, and a fresh snapshot would claim it was.
    async afterStoreDocument({ document, documentName }) {
      const stored = durability.get(documentName)?.lastStored
      if (stored === undefined) return
      document.broadcastStateless(
        serializeStatelessEvent({ type: 'stored', snapshot: stored.snapshot }),
        (connection) => !connection.readOnly,
      )
    },

    // A client that reopens a document from its local copy has nothing new to send, so the server would apply and store
    // nothing and never send `stored`. It is told what is stored now: the last write, or what was loaded, and never memory.
    async connected({ connection, documentName }) {
      if (connection.readOnly) return
      const stored = durability.get(documentName)?.lastStored
      if (stored === undefined) return
      connection.sendStateless(serializeStatelessEvent({ type: 'stored', snapshot: stored.snapshot }))
    },

    // Without this, the last client leaving after a failed write would make Hocuspocus unload the document and drop the
    // changes it acknowledged (F18). Once the server is shutting down there is nothing left to wait for, and what could
    // not be stored is said.
    async beforeUnloadDocument({ documentName }) {
      if (durability.get(documentName)?.unconfirmed !== true) return
      if (!durability.shuttingDown) throw keepLoaded
      log.error({ documentName }, 'unloading a document with changes that were never stored')
    },

    async afterUnloadDocument({ documentName }) {
      durability.forget(documentName)
    },
  }
}
