import type { Schema } from '@draftroom/contract'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { focusMainContent } from '../../app/mainContent.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { useFocusFirstArrival } from '../documents/useFocusFirstArrival.ts'
import { ActivityDays } from './ActivityDays.tsx'
import { ActivityEventSummary } from './ActivityEventSummary.tsx'
import { EventPanel } from './EventPanel.tsx'
import { HistoryFilters } from './HistoryFilters.tsx'
import { workspaceActivityQuery } from './queries.ts'
import { useHistoryFilters } from './useHistoryFilters.ts'
import styles from './History.module.css'

type ActivityEvent = Schema<'ActivityEvent'>

/**
 * The history of a workspace: what people did to the documents the person can read, newest first, a page at a time, narrowed
 * by document, person and period. An event can be opened beside the list. The states are loading, empty, empty under filters,
 * the list with "Load more", and a failure that can be retried.
 *
 * While another filter is on its way the list that was there stays, so the page does not jump to a skeleton at each choice.
 */
export function History({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const state = useHistoryFilters()
  const query = useInfiniteQuery({
    ...workspaceActivityQuery(dataSource, workspaceId, state.request),
    placeholderData: keepPreviousData,
  })
  const events = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => events.map((event) => event.id), [events])
  const list = useRef<HTMLUListElement>(null)
  const panelId = useId()

  // What was asked for, as one string: the rows of another list are not the page that "Load more" asked for.
  const listKey = JSON.stringify([workspaceId, state.request])
  const loadingMore = useFocusFirstArrival(list, ids, 'button', listKey)

  // The event that is open belongs to the filters it was opened under: under others it is not in the list, and that is not
  // because the person lost their access to it.
  const [opened, setOpened] = useState<{ id: string; listKey: string } | null>(null)
  const openedId = opened?.listKey === listKey ? opened.id : null
  const openedEvent = events.find((event) => event.id === openedId)

  const close = () => {
    setOpened(null)
    const row = openedId === null ? null : list.current?.querySelector<HTMLElement>(`[data-event="${openedId}"]`)
    if (row) row.focus()
    else focusMainContent()
  }

  let content: ReactNode
  if (query.isPending) {
    content = <ListSkeleton rows={6} listClassName={styles.skeleton} label="history.loading" />
  } else if (query.isError) {
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
    content = (
      <ActivityDays events={events} headingLevel={2} listRef={list}>
        {(event: ActivityEvent) => (
          <button
            type="button"
            data-event={event.id}
            className={styles.row}
            aria-expanded={event.id === openedId}
            aria-controls={event.id === openedId ? panelId : undefined}
            // The rows of the list that was there are on screen until the filtered one arrives, and an event opened now would
            // be kept with the new filters, where the list that comes does not have it, and be told gone for no loss of access.
            aria-disabled={query.isPlaceholderData || undefined}
            onClick={() => {
              if (!query.isPlaceholderData) setOpened({ id: event.id, listKey })
            }}
          >
            <ActivityEventSummary event={event} />
          </button>
        )}
      </ActivityDays>
    )
  }

  return (
    <div className={openedId === null ? styles.layout : styles.layoutWithPanel}>
      <div className={styles.timeline} aria-busy={query.isPending || query.isPlaceholderData}>
        <HistoryFilters workspaceId={workspaceId} state={state} />
        {content}
        {query.hasNextPage && !query.isError && (
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => {
              loadingMore()
              void query.fetchNextPage()
            }}
          >
            {intl.formatMessage({ id: 'history.loadMore' })}
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
      {openedId !== null && <EventPanel key={openedId} id={panelId} event={openedEvent} onClose={close} />}
    </div>
  )
}
