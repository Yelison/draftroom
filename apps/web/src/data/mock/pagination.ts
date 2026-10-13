import { invalid } from './problems.ts'

export type Direction = 'asc' | 'desc'

export interface PageQuery {
  cursor?: string | undefined
  limit?: number | undefined
}

export interface Ordering<Row> {
  /** The sort key: a timestamp or a name. Compared as text, which orders RFC 3339 UTC instants correctly. */
  key: (row: Row) => string
  /** The tie-breaker, so two rows with the same key never swap places between requests. */
  id: (row: Row) => string
  direction: Direction
}

export interface Position {
  key: string
  id: string
}

const defaultLimit = 25
const maxLimit = 100

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Sorts rows by `(key, id)` in the direction of the list. */
export function sortRows<Row>(rows: readonly Row[], { key, id, direction }: Ordering<Row>): Row[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * (compare(key(a), key(b)) || compare(id(a), id(b))))
}

function toBase64Url(text: string): string {
  const binary = String.fromCharCode(...new TextEncoder().encode(text))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(token: string): string {
  const binary = atob(token.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

/** A cursor carries the position of the last row and the filters of the request that produced it. */
function encodeCursor(position: Position, filters: string): string {
  return toBase64Url(JSON.stringify({ ...position, filters }))
}

function decodeCursor(cursor: string, filters: string): Position {
  try {
    const decoded: unknown = JSON.parse(fromBase64Url(cursor))
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'key' in decoded &&
      'id' in decoded &&
      'filters' in decoded &&
      typeof decoded.key === 'string' &&
      typeof decoded.id === 'string' &&
      decoded.filters === filters
    ) {
      return { key: decoded.key, id: decoded.id }
    }
  } catch {
    // Not base64, not JSON or not UTF-8: the same answer as a cursor of another request.
  }
  throw invalid({ pointer: '/query/cursor', code: 'invalid-value' })
}

/** A page request whose `limit` and `cursor` have been checked, so a bad one is refused before any resource is looked up. */
export interface PageRequest {
  limit: number
  /** Where the previous page ended; `undefined` for the first page. */
  after: Position | undefined
  /** What the cursor of the next page must be bound to. */
  filters: string
}

/** The filters as text, the same whatever the order they were written in and without the ones that are not set. */
const canonical = (filters: Record<string, unknown>): string =>
  JSON.stringify(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => compare(a, b)),
  )

/** Checks `limit` and `cursor` against the filters of the request: the cursor is refused with any other filters. */
export function readPage({ cursor, limit = defaultLimit }: PageQuery, filters: Record<string, unknown>): PageRequest {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw invalid({ pointer: '/query/limit', code: 'invalid-value' })
  }
  const filterKey = canonical(filters)
  return { limit, after: cursor === undefined ? undefined : decodeCursor(cursor, filterKey), filters: filterKey }
}

/** One page of an already filtered list; it starts right after the row the cursor names, even if that row is gone. */
export function paginate<Row>(
  rows: readonly Row[],
  ordering: Ordering<Row>,
  { limit, after, filters }: PageRequest,
): { items: Row[]; nextCursor: string | null } {
  const sign = ordering.direction === 'asc' ? 1 : -1
  const remaining = sortRows(rows, ordering).filter(
    (row) =>
      after === undefined || sign * (compare(ordering.key(row), after.key) || compare(ordering.id(row), after.id)) > 0,
  )
  const items = remaining.slice(0, limit)
  const last = items.at(-1)
  const nextCursor =
    last !== undefined && remaining.length > items.length
      ? encodeCursor({ key: ordering.key(last), id: ordering.id(last) }, filters)
      : null
  return { items, nextCursor }
}
