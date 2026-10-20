import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { ActorAvatar } from './ActorAvatar.tsx'
import { useEventSentence } from './useEventSentence.tsx'
import styles from './ActivityEventSummary.module.css'

/** One event on one line: who did it, what they did and at what time of the day. */
export function ActivityEventSummary({ event }: { event: Schema<'ActivityEvent'> }) {
  const intl = useIntl()
  const sentence = useEventSentence()

  return (
    <span className={styles.summary}>
      <ActorAvatar actor={event.actor} />
      <span className={styles.sentence}>{sentence(event)}</span>
      <time className={styles.time} dateTime={event.createdAt}>
        {intl.formatTime(event.createdAt, { timeStyle: 'short' })}
      </time>
    </span>
  )
}
