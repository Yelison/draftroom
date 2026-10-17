import { sql, type Kysely } from 'kysely'
import type { Database } from '../tables.ts'

/**
 * Replaces the stored Yjs state of a document. It writes nothing, and does not fail, for a document that no longer
 * exists: a document deleted for good has no row left (the delete cascades), and there is nothing to keep.
 *
 * Pass a transaction to write it together with other rows. The store hook writes it alone, and a restore writes it with
 * the version and the event of the history that say why (protocol §11.4).
 */
export async function writeDocumentState(db: Kysely<Database>, documentId: string, state: Uint8Array): Promise<void> {
  await db
    .updateTable('document_states')
    .set({ state, updated_at: sql`now()` })
    .where('document_id', '=', documentId)
    .execute()
}
