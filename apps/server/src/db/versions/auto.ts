import { sql, type Kysely } from 'kysely'
import type { Database } from '../tables.ts'

// What the automatic versions read and write about the stores of documents (protocol §11.2). A store stamps
// `document_states.updated_at`; `versions_checked_at` holds the stamp the last look was made at, so a document that was
// looked at and had nothing to version is not looked at again until it is stored again.

/** A document that was stored and has not been looked at since. */
export interface UnexaminedStore {
  readonly documentId: string
  readonly workspaceId: string
  /** When it was last stored: the idle clock, for a document nobody has open. */
  readonly updatedAt: Date
  /** `updated_at` as PostgreSQL writes it, microseconds included: what `markExamined` compares to. */
  readonly updatedAtKey: string
}

const stampKey = sql<string>`to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** The documents last stored at or before `storedBefore` that the automatic versions have not looked at since, oldest first. */
export async function findUnexaminedStores(db: Kysely<Database>, storedBefore: Date): Promise<UnexaminedStore[]> {
  const rows = await db
    .selectFrom('document_states')
    .select(['document_id', 'workspace_id', 'updated_at', stampKey.as('updatedAtKey')])
    .where('updated_at', '<=', storedBefore)
    .where((eb) => eb.or([eb('versions_checked_at', 'is', null), eb('versions_checked_at', '<', eb.ref('updated_at'))]))
    .orderBy('updated_at')
    .execute()
  return rows.map((row) => ({
    documentId: row.document_id,
    workspaceId: row.workspace_id,
    updatedAt: row.updated_at,
    updatedAtKey: row.updatedAtKey,
  }))
}

/**
 * Says that the store stamped as `store.updatedAtKey` was looked at. A document stored again in the meantime has a newer
 * stamp and stays unexamined, which is why the stamp is compared and not just the document.
 */
export async function markExamined(db: Kysely<Database>, store: UnexaminedStore): Promise<void> {
  await db
    .updateTable('document_states')
    .set({ versions_checked_at: sql`updated_at` })
    .where('document_id', '=', store.documentId)
    .where(sql<boolean>`updated_at = ${store.updatedAtKey}::timestamptz`)
    .execute()
}
