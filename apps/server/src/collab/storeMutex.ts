import type { Document, Hocuspocus } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'

// Hocuspocus unloads a document at one moment: when its last connection closes, and only if nothing holds the document's
// store mutex then (`shouldUnloadDocument`). It does not look again. Before versions only a store held the mutex, and a
// store looks again when it ends; whoever else holds it has to do the same, or a person who leaves meanwhile leaves the
// document in memory for ever with nobody connected.

/** Unloads the document if nobody has it open and nothing is being written: Hocuspocus checks that itself, so asking is always safe. */
export const unloadIfAbandoned = (hocuspocus: Hocuspocus<ConnectionContext>, document: Document): Promise<void> =>
  hocuspocus.unloadDocument(document)

/**
 * Runs `task` holding the document's store mutex, as every store does, and looks again at unloading the document once the
 * mutex is released. The one place that takes the mutex for work that is not a store.
 */
export async function holdingStoreMutex<Result>(
  hocuspocus: Hocuspocus<ConnectionContext>,
  document: Document,
  task: () => Promise<Result>,
): Promise<Result> {
  try {
    return await document.saveMutex.runExclusive(task)
  } finally {
    await unloadIfAbandoned(hocuspocus, document)
  }
}
