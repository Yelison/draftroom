import type { Schema } from '@draftroom/contract'
import type { ReactNode, RefObject } from 'react'
import { useIntl } from 'react-intl'
import styles from './ActivityDays.module.css'

type ActivityEvent = Schema<'ActivityEvent'>

export interface ActivityDaysProps {
  events: readonly ActivityEvent[]
  /** The level of the heading of each day, one under the heading of the place the list is in. */
  headingLevel: 2 | 3
  listRef?: RefObject<HTMLUListElement | null>
  /** The content of the row of an event: a button that opens it, or the event alone. */
  children: (event: ActivityEvent) => ReactNode
}

/** The day of an instant in the person's own time zone, which is the day they would say it happened. */
const dayOf = (instant: string): string => {
  const date = new Date(instant)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Events newest first, with the day written above the first event of each day. It is one flat list, so that the rows are
 * the children of the list (what the focus of "Load more" counts), and the day is the first thing in the row that starts it.
 */
export function ActivityDays({ events, headingLevel, listRef, children }: ActivityDaysProps) {
  const intl = useIntl()
  const Heading = `h${headingLevel}` as const

  return (
    <ul ref={listRef} className={styles.list}>
      {events.map((event, index) => {
        const previous = events[index - 1]
        const startsDay = previous === undefined || dayOf(previous.createdAt) !== dayOf(event.createdAt)
        return (
          <li key={event.id} className={styles.item}>
            {startsDay && (
              <Heading className={styles.day}>{intl.formatDate(event.createdAt, { dateStyle: 'full' })}</Heading>
            )}
            {children(event)}
          </li>
        )
      })}
    </ul>
  )
}
