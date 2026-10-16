import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '../../src/db/tables.ts'

/**
 * Sends requests while a transaction holds something on the database, and lets it go once the requests have had time to
 * read what they read and queue behind it: the only way to make requests overlap on purpose. What they do next is
 * decided by the statement that writes, not by the check each of them made before.
 */
export async function whileHeld<T>(
  db: Kysely<Database>,
  hold: (trx: Transaction<Database>) => Promise<unknown>,
  send: () => Promise<T>[],
): Promise<T[]> {
  let answers: Promise<T[]> = Promise.resolve([])
  await db.transaction().execute(async (trx) => {
    await hold(trx)
    answers = Promise.all(send())
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  return answers
}

/** Holds a lock on a row, so the requests that write it queue up behind each other. */
export const whileRowIsLocked = <T>(
  db: Kysely<Database>,
  row: { table: 'documents' | 'folders'; id: string },
  send: () => Promise<T>[],
): Promise<T[]> =>
  whileHeld(db, (trx) => sql`select 1 from ${sql.table(row.table)} where id = ${row.id} for update`.execute(trx), send)

/** Deletes a folder in a transaction that is not committed yet: the requests see it, and it is gone when they write. */
export const whileFolderIsBeingDeleted = <T>(
  db: Kysely<Database>,
  folderId: string,
  send: () => Promise<T>[],
): Promise<T[]> => whileHeld(db, (trx) => trx.deleteFrom('folders').where('id', '=', folderId).execute(), send)
