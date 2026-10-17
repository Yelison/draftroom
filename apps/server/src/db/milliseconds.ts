import { sql, type RawBuilder } from 'kysely'
import type { CursorPosition } from '../domain/pagination.ts'

// The API writes an instant with milliseconds (`Date#toISOString`) and the contract orders a list by what it writes, then
// by `id`. PostgreSQL keeps microseconds, so ordering by the column would put two rows of one millisecond, which the API
// shows as the same instant, in the order of their microseconds, and `id` would never be what decides. The order, the
// cursor and its key are therefore all cut to the millisecond: the precision of what the client can see.
//
// The cut is made on the instant in UTC (a `timestamp`, not a `timestamptz`): `date_trunc` on a `timestamptz` depends on
// the session's time zone and cannot be the expression of an index, and this one can.

/** The instant of a column cut to the millisecond. It is cut and not rounded, as `toISOString` cuts. */
export const inMilliseconds = (column: string): RawBuilder<Date> =>
  sql<Date>`date_trunc('milliseconds', ${sql.ref(column)} at time zone 'UTC')`

/**
 * The instant as a cursor holds it: written by PostgreSQL in UTC, with the six decimals of every cursor and the last three
 * of them zero.
 */
export const millisecondKey = (column: string): RawBuilder<string> =>
  sql<string>`to_char(${inMilliseconds(column)}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** The rows that come after a position in a list that is newest first: those before it, by the instant and then by `id`. */
export const isBefore = (column: string, idColumn: string, { timestamp, id }: CursorPosition): RawBuilder<boolean> =>
  sql<boolean>`(${inMilliseconds(column)}, ${sql.ref(idColumn)}) < (${timestamp}::timestamptz at time zone 'UTC', ${id}::uuid)`
