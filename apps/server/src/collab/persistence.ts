import type { Document, Extension } from '@hocuspocus/server'
import * as Y from 'yjs'
import type { ConnectionContext } from './context.ts'
import { isReadable, removeForbiddenBlocks } from './contentValidation.ts'
import { documentIdOf } from './documentId.ts'
import { snapshotOf, type CapturedWrite, type DocumentDurability, type DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'
import type { StateStore } from './stateStore.ts'
import type { RevocationMarks } from './inFlight.ts'
import type { StoreRetry } from './storeRetry.ts'

export interface PersistenceOptions {
  readonly store: StateStore
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly marks: RevocationMarks
  readonly log: CollabLog
}

/** Loads the stored Yjs state of a document and writes it back: the binary state is the only source of content (ADR 0005). */
export function persistenceExtension({
  store,
  durability,
  retry,
  marks,
  log,
}: PersistenceOptions): Extension<ConnectionContext> {
  return {
    extensionName: 'draftroom-persistence',

    async onLoadDocument({ document, documentName, context }) {
      try {
        const state = await store.load(documentIdOf(documentName))
        // Authentication found the document a moment ago, so a missing state is a document deleted since: refuse to load.
        if (state === undefined) throw new Error(`There is no stored state for ${documentName}`)
        Y.applyUpdate(document, state)
        durability.track(document, documentName, { snapshot: snapshotOf(document), size: state.byteLength })
      } catch (error) {
        // The connection that was loading will not be registered: it is no longer in flight.
        marks.settle(context.sequence)
        throw error
      }
    },

    // Runs inside the document's store mutex, as does `afterStoreDocument`, so the capture, the write and the
    // commit below are atomic with respect to other stores (protocol §7.2).
    async onStoreDocument({ document, documentName, instance }) {
      const durable = durability.get(documentName)
      if (durable === undefined) throw new Error(`${documentName} is not tracked`)
      try {
        const write = captureStorable(document, durable, log)
        await store.save(documentIdOf(documentName), write.state)
        durable.commit(write)
        retry.succeeded(documentName)
      } catch (error) {
        // Hocuspocus logs a failed store with no mention of the document, and does not try again (F4).
        log.error({ documentName, error }, 'storing a document failed')
        retry.failed(instance, document)
        throw error
      }
    },
  }
}

/**
 * Captures the document so that what is written can be read back by the schema's reader (ADR 0011). A state it refuses
 * is repaired and captured again; one that is still refused is never written, because content the server cannot read
 * is content it could not restore, version or show.
 */
function captureStorable(document: Document, durable: DocumentDurability, log: CollabLog): CapturedWrite {
  const first = durable.capture(document)
  if (isReadable(first.state)) return first
  const removed = removeForbiddenBlocks(document)
  log.warn({ documentName: document.name, removed }, 'removed content the schema does not allow before storing')
  const repaired = durable.capture(document)
  if (!isReadable(repaired.state)) throw new Error(`The content of ${document.name} is not readable after the repair`)
  return repaired
}
