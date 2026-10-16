import { sql, type Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'

/**
 * Sends requests while a lock on a row is held, and lets the lock go once they have had time to read the row and queue
 * behind it: the only way to make requests overlap on purpose. Whatever the requests do to the row is decided by the
 * statement that writes it, not by the check each of them made before.
 */
export async function whileRowIsLocked<T>(
  db: Kysely<Database>,
  row: { table: 'documents' | 'folders'; id: string },
  send: () => Promise<T>[],
): Promise<T[]> {
  let answers: Promise<T[]> = Promise.resolve([])
  await db.transaction().execute(async (trx) => {
    await sql`select 1 from ${sql.table(row.table)} where id = ${row.id} for update`.execute(trx)
    answers = Promise.all(send())
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  return answers
}
