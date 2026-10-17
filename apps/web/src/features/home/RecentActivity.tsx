import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { ActivityDays } from '../history/ActivityDays.tsx'
import { ActivityEventSummary } from '../history/ActivityEventSummary.tsx'
import { workspaceActivityQuery } from '../history/queries.ts'
import styles from './Home.module.css'

/** How many events the home shows: the latest of them, with the way to the rest. */
const shownEvents = 8

/**
 * What happened lately in the workspace, over the same list the History screen reads and so from the same cache entry:
 * loading, nothing yet, the latest events with the way to all of them, and a failure that can be retried.
 */
export function RecentActivity({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery(workspaceActivityQuery(dataSource, workspaceId, {}))
  const events = query.data?.pages.flatMap((page) => page.items).slice(0, shownEvents) ?? []

  return (
    <section aria-labelledby="home-activity">
      <h2 id="home-activity" className={styles.group}>
        {intl.formatMessage({ id: 'home.activity.title' })}
      </h2>
      {query.isPending && (
        <ListSkeleton rows={4} listClassName={styles.activitySkeleton} label="home.activity.loading" />
      )}
      {query.isError && (
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'home.activity.error.title' })}
          description={intl.formatMessage({ id: 'home.activity.error.description' })}
        >
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            {intl.formatMessage({ id: 'home.activity.error.retry' })}
          </Button>
        </StateMessage>
      )}
      {query.isSuccess && events.length === 0 && (
        <StateMessage
          title={intl.formatMessage({ id: 'home.activity.empty.title' })}
          description={intl.formatMessage({ id: 'home.activity.empty.description' })}
        />
      )}
      {query.isSuccess && events.length > 0 && (
        <>
          <ActivityDays events={events} headingLevel={3}>
            {(event) => <ActivityEventSummary event={event} />}
          </ActivityDays>
          <Link to="/history" className={buttonClassName({ variant: 'secondary' })}>
            {intl.formatMessage({ id: 'home.activity.all' })}
          </Link>
        </>
      )}
    </section>
  )
}
