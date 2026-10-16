import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { activityFilters, appliedCount, readFilters, type HistoryFilters } from './historyFilters.ts'
import type { ActivityFilters } from './queries.ts'

const parameterOf = { documentId: 'document', actorId: 'person', range: 'range' } as const

export interface HistoryFilterState {
  readonly filters: HistoryFilters
  /** What the list is asked for, with the range already an instant. */
  readonly request: ActivityFilters
  readonly applied: number
  set: <Name extends keyof HistoryFilters>(name: Name, value: HistoryFilters[Name]) => void
  clear: () => void
}

/**
 * The filters of the history, kept in the address. The instant a range counts from is taken once, when the screen is
 * opened, so a list and its "Load more" keep asking with the same filters.
 */
export function useHistoryFilters(): HistoryFilterState {
  const [params, setParams] = useSearchParams()
  const [openedAt] = useState(() => Date.now())
  const filters = useMemo(() => readFilters(params), [params])
  const request = useMemo(() => activityFilters(filters, openedAt), [filters, openedAt])

  // Replaced, not pushed: each choice of a filter is not a page of its own to come back to.
  const set: HistoryFilterState['set'] = (name, value) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === undefined) next.delete(parameterOf[name])
        else next.set(parameterOf[name], value)
        return next
      },
      { replace: true },
    )
  const clear = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const parameter of Object.values(parameterOf)) next.delete(parameter)
        return next
      },
      { replace: true },
    )

  return { filters, request, applied: appliedCount(filters), set, clear }
}
