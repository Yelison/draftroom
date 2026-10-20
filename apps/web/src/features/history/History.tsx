import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { HistoryFilters } from './HistoryFilters.tsx'
import { Timeline } from './Timeline.tsx'
import { TimelineSkeleton } from './TimelineSkeleton.tsx'
import { workspaceActivityQuery } from './queries.ts'
import { groupRenameBursts } from './renameBursts.ts'
import { groupByWeekAndDay } from './timelineGroups.ts'
import { useFocusLoadedEntry } from './useFocusLoadedEntry.ts'
import { useHistoryFilters } from './useHistoryFilters.ts'
import { useTimelineCalendar } from './useTimelineCalendar.ts'

/**
 * The history of a workspace: what people did to the documents the person can read, newest first, a page at a time,
 * narrowed by document, person and period. The states are loading, empty, empty under filters, the timeline with "Load
 * more", a failure that can be retried and, when it is "Load more" that failed, the timeline with the way to try again.
 *
 * The renames that follow one another are folded into one entry over every page that is loaded, so a burst that "Load
 * more" cut in two is one burst again when the second half arrives. While another filter is on its way the timeline that
 * was there stays, so the page does not jump to a skeleton at each choice.
 */
export function History({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const state = useHistoryFilters()
  const { timeZone, firstDay } = useTimelineCalendar()
  const query = useInfiniteQuery({
    ...workspaceActivityQuery(dataSource, workspaceId, state.request),
    placeholderData: keepPreviousData,
  })
  const events = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const entries = useMemo(() => groupRenameBursts(events), [events])
  const weeks = useMemo(() => groupByWeekAndDay(entries, { timeZone, firstDay }), [entries, timeZone, firstDay])
  const root = useRef<HTMLDivElement>(null)

  // What was asked for, as one string: the entries of another list are not the page that "Load more" asked for.
  const listKey = JSON.stringify([workspaceId, state.request])
  const loadingMore = useFocusLoadedEntry(root, entries, listKey)
  const loadMoreFailed = query.isFetchNextPageError

  let content: ReactNode
  if (query.isPending) {
    content = <TimelineSkeleton />
  } else if (query.isError && !loadMoreFailed) {
    content = (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'history.error.title' })}
        description={intl.formatMessage({ id: 'history.error.description' })}
      >
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>
          {intl.formatMessage({ id: 'history.error.retry' })}
        </Button>
      </StateMessage>
    )
  } else if (events.length === 0 && state.applied > 0) {
    content = (
      <StateMessage
        title={intl.formatMessage({ id: 'history.filteredEmpty.title' })}
        description={intl.formatMessage({ id: 'history.filteredEmpty.description' })}
      />
    )
  } else if (events.length === 0) {
    content = (
      <StateMessage
        title={intl.formatMessage({ id: 'history.empty.title' })}
        description={intl.formatMessage({ id: 'history.empty.description' })}
      />
    )
  } else {
    // Keyed by the filters, so that what the person unfolded under one is not unfolded again under another.
    content = <Timeline key={listKey} weeks={weeks} />
  }

  const fetchNextPage = () => {
    loadingMore()
    void query.fetchNextPage()
  }

  return (
    <div ref={root} aria-busy={query.isPending || query.isPlaceholderData}>
      <HistoryFilters workspaceId={workspaceId} state={state} />
      {content}
      {loadMoreFailed && (
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'history.loadMore.error.title' })}
          description={intl.formatMessage({ id: 'history.error.description' })}
        />
      )}
      {/* One button for "Load more" and for the retry after it failed, in the same place: the focus is on it when the page is
          asked for, and a button that is replaced by another would hand the focus to the page. */}
      {query.hasNextPage && (loadMoreFailed || !query.isError) && (
        <Button variant="secondary" loading={query.isFetchingNextPage} onClick={fetchNextPage}>
          {intl.formatMessage({ id: loadMoreFailed ? 'history.error.retry' : 'history.loadMore' })}
        </Button>
      )}
      {state.applied > 0 && query.isSuccess && (
        <p role="status" className="forma-visually-hidden">
          {intl.formatMessage(
            { id: query.hasNextPage ? 'history.results.more' : 'history.results.announcement' },
            { count: events.length },
          )}
        </p>
      )}
    </div>
  )
}
