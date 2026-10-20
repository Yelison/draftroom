import type { Schema } from '@draftroom/contract'
import type { UseQueryResult } from '@tanstack/react-query'
import { Icon } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { ActorAvatar } from '../history/ActorAvatar.tsx'
import { useEventSentence } from '../history/useEventSentence.tsx'
import { SectionError } from './SectionError.tsx'
import styles from './Home.module.css'

const sameDay = (first: Date, second: Date) => first.toDateString() === second.toDateString()

/**
 * The newest thing that happened in the workspace, in one line with the way to the rest. A workspace where nothing has
 * happened has no line. The time alone says "today", so an older event also says its day.
 */
export function LatestEvent({ latest }: { latest: UseQueryResult<Schema<'ActivityEvent'> | null> }) {
  const intl = useIntl()
  const sentence = useEventSentence()
  // Today is the day the page was opened: the line is not redrawn at midnight, and it need not be.
  const [today] = useState(() => new Date())
  const event = latest.data ?? undefined

  if (latest.isSuccess && event === undefined) return null
  if (latest.isError) {
    return <SectionError title="home.latest.error" retrying={latest.isFetching} onRetry={() => void latest.refetch()} />
  }

  return (
    <section aria-labelledby="home-latest" className={styles.latest}>
      {event === undefined ? (
        <div aria-busy="true" className={styles.latestSkeleton}>
          <p role="status" className="forma-visually-hidden">
            {intl.formatMessage({ id: 'home.latest.loading' })}
          </p>
        </div>
      ) : (
        <>
          {event.actor === null ? (
            // Nobody did it: a person's initials would read as one, so the server's own changes get a clock.
            <span className={styles.automatic}>
              <Icon name="clock" size={16} />
            </span>
          ) : (
            <ActorAvatar actor={event.actor} />
          )}
          <p className={styles.latestText}>
            <span id="home-latest" className={styles.latestLabel}>
              {intl.formatMessage({ id: 'home.latest.title' })}
            </span>
            <span>{sentence(event)}</span>
          </p>
          <time dateTime={event.createdAt} className={styles.latestTime}>
            {intl.formatDate(
              event.createdAt,
              sameDay(new Date(event.createdAt), today)
                ? { timeStyle: 'short' }
                : { dateStyle: 'medium', timeStyle: 'short' },
            )}
          </time>
          <Link to="/history" className={styles.latestAll}>
            {intl.formatMessage({ id: 'home.latest.all' })}
          </Link>
        </>
      )}
    </section>
  )
}
