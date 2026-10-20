import { Icon } from '@yelison/forma-ui'
import { useId, useState } from 'react'
import { useIntl } from 'react-intl'
import { ActorAvatar } from './ActorAvatar.tsx'
import { DocumentLink } from './DocumentLink.tsx'
import type { TimelineEntry } from './renameBursts.ts'
import { useTimelineCalendar } from './useTimelineCalendar.ts'
import styles from './Timeline.module.css'

type Burst = Extract<TimelineEntry, { kind: 'burst' }>

/**
 * The renames of one document that followed one another, as one line: how many there were and between what times, with a
 * button that unfolds in place who made each and when. The focus stays on the button, so the person can fold it again.
 *
 * It stands in for a disclosure until Forma UI has one; it is not meant to be reused apart from this timeline.
 */
export function RenameBurst({ burst }: { burst: Burst }) {
  const intl = useIntl()
  const { timeZone } = useTimelineCalendar()
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const [newest] = burst.events
  const oldest = burst.events[burst.events.length - 1] ?? newest

  return (
    <>
      <ActorAvatar actor={newest.actor} />
      <div className={styles.burst}>
        <span className={styles.text}>
          <span id={`${id}-summary`} className={styles.summary}>
            <span>
              {intl.formatMessage(
                { id: 'history.burst.renamed' },
                { title: <DocumentLink document={newest.document} />, count: burst.events.length },
              )}
            </span>
            <span aria-hidden="true" className={styles.interval}>
              ·
            </span>
            <span className={styles.interval}>
              {intl.formatDateTimeRange(new Date(oldest.createdAt), new Date(newest.createdAt), {
                timeStyle: 'short',
                timeZone,
              })}
            </span>
          </span>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={`${id}-people`}
            aria-describedby={`${id}-summary`}
            onClick={() => setExpanded((open) => !open)}
          >
            {intl.formatMessage({ id: 'history.burst.details' })}
            <Icon name="chevron" size={16} className={expanded ? styles.chevronOpen : styles.chevron} />
          </button>
        </span>
        {/* Hidden, not unmounted: what the button controls is always there to point at. */}
        <ul id={`${id}-people`} hidden={!expanded} className={styles.people}>
          {burst.events.map((event) => (
            <li key={event.id} className={styles.person}>
              <ActorAvatar actor={event.actor} />
              <span>{event.actor?.name}</span>
              <time className={styles.personTime} dateTime={event.createdAt}>
                {intl.formatTime(event.createdAt, { timeStyle: 'short', timeZone })}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
