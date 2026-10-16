import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/tables.ts'

/** Where the binary Yjs state of documents is kept. The collaboration server is its only writer (ADR 0005). */
export interface StateStore {
  /** The stored state, or `undefined` when the document has none: it does not exist, or was deleted. */
  load(documentId: string): Promise<Uint8Array | undefined>
  /** Replaces the state. It resolves, writing nothing, for a document that no longer exists. */
  save(documentId: string, state: Uint8Array): Promise<void>
}

export function createPostgresStateStore(database: Kysely<Database>): StateStore {
  return {
    async load(documentId) {
      const row = await database
        .selectFrom('document_states')
        .select('state')
        .where('document_id', '=', documentId)
        .executeTakeFirst()
      return row?.state
    },

    async save(documentId, state) {
      // No row is not a failure: a document deleted for good has none left (the delete cascades), and there is nothing
      // to keep. Failing would make the retry loop hold it in memory for ever.
      await database
        .updateTable('document_states')
        .set({ state, updated_at: sql`now()` })
        .where('document_id', '=', documentId)
        .execute()
    },
  }
}
