import { useId } from 'react'
import { useIntl } from 'react-intl'
import { EventEntry } from './EventEntry.tsx'
import { RenameBurst } from './RenameBurst.tsx'
import { entryEvent } from './renameBursts.ts'
import type { TimelineWeek } from './timelineGroups.ts'
import { useTimelineCalendar } from './useTimelineCalendar.ts'
import { isAccessEvent } from './activityEvents.ts'
import styles from './Timeline.module.css'

/**
 * What happened, by week and by day with the time of each event at its side: a line down the page with a point for each
 * entry, amber for a change of who can open a document. The week is a region named by its heading, one level under
 * the headline of the screen; the day is a heading inside it, so the list of regions does not fill up with days.
 */
export function Timeline({ weeks }: { weeks: readonly TimelineWeek[] }) {
  const intl = useIntl()
  const { timeZone } = useTimelineCalendar()
  const id = useId()

  return (
    <div className={styles.timeline}>
      {weeks.map((week) => (
        <section key={week.key} aria-labelledby={`${id}-week-${week.key}`} className={styles.week}>
          <h2 id={`${id}-week-${week.key}`} className={styles.weekTitle}>
            {intl.formatMessage(
              { id: 'history.week' },
              { date: intl.formatDate(week.start, { month: 'short', day: 'numeric', timeZone: 'UTC' }) },
            )}
          </h2>
          {week.days.map((day) => (
            <div key={day.key} className={styles.day}>
              <h3 className={styles.dayTitle}>{intl.formatDate(day.date, { dateStyle: 'full', timeZone: 'UTC' })}</h3>
              <ol className={styles.list}>
                {day.entries.map((entry) => {
                  const event = entryEvent(entry)
                  return (
                    <li
                      key={entry.key}
                      data-entry={entry.key}
                      className={entry.kind === 'event' && isAccessEvent(entry.event) ? styles.accessItem : styles.item}
                    >
                      <time className={styles.time} dateTime={event.createdAt}>
                        {intl.formatTime(event.createdAt, { timeStyle: 'short', timeZone })}
                      </time>
                      <div className={styles.body}>
                        {entry.kind === 'event' ? <EventEntry event={entry.event} /> : <RenameBurst burst={entry} />}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
