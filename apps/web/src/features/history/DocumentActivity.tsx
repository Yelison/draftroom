import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { useFocusFirstArrival } from '../documents/useFocusFirstArrival.ts'
import { ActivityDays } from './ActivityDays.tsx'
import { ActivityEventSummary } from './ActivityEventSummary.tsx'
import { documentActivityQuery } from './queries.ts'
import styles from './DocumentActivity.module.css'

/**
 * What happened to one document, newest first and a page at a time: loading, nothing yet, the list with "Load more", and a
 * failure that can be retried. It knows nothing of where it is shown; its days are `h3`, for a place that has an `h2` of its own.
 */
export function DocumentActivity({ documentId }: { documentId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery(documentActivityQuery(dataSource, documentId))
  const events = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => events.map((event) => event.id), [events])
  const list = useRef<HTMLUListElement>(null)
  const loadingMore = useFocusFirstArrival(list, ids, '[tabindex]', documentId)

  if (query.isPending) return <ListSkeleton rows={5} listClassName={styles.skeleton} label="history.document.loading" />
  if (query.isError) {
    return (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'history.document.error.title' })}
        description={intl.formatMessage({ id: 'history.error.description' })}
      >
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>
          {intl.formatMessage({ id: 'history.error.retry' })}
        </Button>
      </StateMessage>
    )
  }
  if (events.length === 0) {
    return (
      <StateMessage
        title={intl.formatMessage({ id: 'history.document.empty.title' })}
        description={intl.formatMessage({ id: 'history.document.empty.description' })}
      />
    )
  }

  return (
    <>
      <ActivityDays events={events} headingLevel={3} listRef={list}>
        {(event) => (
          // Not a stop of the Tab key: the focus goes here only when "Load more" is gone and has to hand it on.
          <div tabIndex={-1} className={styles.event}>
            <ActivityEventSummary event={event} />
          </div>
        )}
      </ActivityDays>
      {query.hasNextPage && (
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
    </>
  )
}
