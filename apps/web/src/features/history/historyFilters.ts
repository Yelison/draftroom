import type { ActivityFilters } from './queries.ts'

// The filters of the history are in the address, so that a filtered history can be shared and survives a reload:
// `?document=<id>&person=<id>&range=week`. What the address says is read here, and a value that is not one of ours is
// left out, so an address typed by hand cannot make the list fail.

export const ranges = ['today', 'week', 'month'] as const
export type HistoryRange = (typeof ranges)[number]

export interface HistoryFilters {
  readonly documentId?: string
  readonly actorId?: string
  readonly range?: HistoryRange
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dayInMilliseconds = 24 * 60 * 60 * 1000
const rangeDays: Record<Exclude<HistoryRange, 'today'>, number> = { week: 7, month: 30 }

const rangeOf = (value: string | null): HistoryRange | undefined => ranges.find((range) => range === value)
const idOf = (value: string | null): string | undefined => (value !== null && uuid.test(value) ? value : undefined)

export function readFilters(params: URLSearchParams): HistoryFilters {
  const documentId = idOf(params.get('document'))
  const actorId = idOf(params.get('person'))
  const range = rangeOf(params.get('range'))
  return {
    ...(documentId === undefined ? {} : { documentId }),
    ...(actorId === undefined ? {} : { actorId }),
    ...(range === undefined ? {} : { range }),
  }
}

/** How many filters are applied. */
export const appliedCount = (filters: HistoryFilters): number => Object.keys(filters).length

/** The instant a range starts at, counted from `now`: the start of today, or that many days back. */
export function rangeStart(range: HistoryRange, now: number): string {
  if (range === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  return new Date(now - rangeDays[range] * dayInMilliseconds).toISOString()
}

/**
 * The filters as the request names them. The range becomes an instant counted from `now`, which the caller fixes once:
 * the cursor of a page is tied to the filters of the request that made it, so an instant that moved with the clock
 * would make "Load more" refuse the cursor.
 */
export function activityFilters({ documentId, actorId, range }: HistoryFilters, now: number): ActivityFilters {
  return {
    ...(documentId === undefined ? {} : { documentId }),
    ...(actorId === undefined ? {} : { actorId }),
    ...(range === undefined ? {} : { from: rangeStart(range, now) }),
  }
}
