import { sql, type Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'

// Rows that share a millisecond and differ in their microseconds, which the API cannot show and a `Date` cannot hold.

/**
 * Instants inside one millisecond whose order is the opposite of the order of the ids: the smallest id gets the latest
 * instant, and the latest of all is the 999 µs mark, which a millisecond that rounded would send to the next one. A list
 * that ordered by the whole instant would give the ids' order reversed; the contract's is the millisecond, then `id`.
 */
export function instantsAgainstIds(ids: readonly string[], millisecond: number): Map<string, string> {
  const marks = [999, 500, 300, 200, 100]
  if (ids.length > marks.length) throw new Error(`There are marks for ${marks.length} rows, not ${ids.length}`)
  const stamps = new Map<string, string>()
  for (const [index, id] of [...ids].sort().entries()) {
    const micros = String(marks[index]).padStart(3, '0')
    stamps.set(id, `2026-10-13T16:00:00.${String(millisecond).padStart(3, '0')}${micros}Z`)
  }
  return stamps
}

type StampedTable = 'documents' | 'threads' | 'comments' | 'activity_events' | 'document_versions'

/** Sets the instants of the rows exactly, microseconds included. */
export async function setInstants(
  db: Kysely<Database>,
  table: StampedTable,
  column: 'updated_at' | 'created_at',
  stamps: ReadonlyMap<string, string>,
): Promise<void> {
  for (const [id, stamp] of stamps) {
    await sql`update ${sql.table(table)} set ${sql.ref(column)} = ${stamp}::timestamptz where id = ${id}`.execute(db)
  }
}
