import { createHash } from 'node:crypto'
import { z } from 'zod'
import { isStorableInstant } from './activity.ts'

// The cursor of a list ordered by a timestamp and then by id: a position in that order, bound to the request that
// produced it. It is opaque to clients and carries nothing but a place in a list, so it needs no signature: a made-up
// one can only start a page somewhere among the rows the caller may read anyway.

export interface CursorPosition {
  /**
   * The timestamp of the last row, written by PostgreSQL with microseconds. A JavaScript `Date` keeps milliseconds, and
   * a cursor built from one would skip the rows that share its millisecond.
   */
  readonly timestamp: string
  readonly id: string
}

/** What a list was filtered by. A cursor only continues the list it came from. */
export type CursorFilters = Readonly<Record<string, string | boolean | null>>

const microsecondTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const fingerprint = (filters: CursorFilters): string =>
  createHash('sha256')
    .update(JSON.stringify(Object.entries(filters).sort(([first], [second]) => first.localeCompare(second))))
    .digest('base64url')
    .slice(0, 22)

export function encodeCursor({ timestamp, id }: CursorPosition, filters: CursorFilters): string {
  return Buffer.from(JSON.stringify({ t: timestamp, i: id, f: fingerprint(filters) })).toString('base64url')
}

/**
 * A real instant that the database can hold: `Date` rolls an impossible day (the 30th of February) over to the next
 * month, which gives it away, and accepts a year 0000 that does not exist and that PostgreSQL refuses, so a made-up
 * cursor with it would be a 500 and not a 400.
 */
const isInstant = (timestamp: string): boolean => {
  const date = new Date(timestamp.slice(0, 23) + 'Z')
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 19) === timestamp.slice(0, 19) &&
    isStorableInstant(timestamp)
  )
}

const cursorShape = z.object({
  t: z.string().regex(microsecondTimestamp).refine(isInstant),
  i: z.string().regex(uuid),
  f: z.string(),
})

/** The position a cursor holds, or `null` when it is malformed or was issued for other filters. */
export function decodeCursor(token: string, filters: CursorFilters): CursorPosition | null {
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const parsed = cursorShape.safeParse(json)
  if (!parsed.success || parsed.data.f !== fingerprint(filters)) return null
  return { timestamp: parsed.data.t, id: parsed.data.i }
}
