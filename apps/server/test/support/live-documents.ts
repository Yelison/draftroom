import type { Kysely } from 'kysely'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import { DocumentGoneError, type LiveDocuments } from '../../src/http/live-documents.ts'

/**
 * For an app under test that has no collaboration server beside it: nobody has a document open, so its state is the
 * stored one, and there is nothing to restore into.
 */
export function storedDocuments(database: Kysely<Database>): LiveDocuments {
  const store = createPostgresStateStore(database)
  return {
    async withState(documentId, task) {
      const state = await store.load(documentId)
      if (state === undefined) throw new DocumentGoneError(documentId)
      return task(state)
    },
    restore: () => Promise.reject(new Error('This app has no collaboration server to restore with')),
  }
}
