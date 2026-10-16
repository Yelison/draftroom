import type { Schema } from '@draftroom/contract'
import { Avatar } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { useEventSentence } from './useEventSentence.ts'
import styles from './ActivityEventSummary.module.css'

// The name an automatic change is credited to: its initials are all the avatar shows, and the sentence names nobody.
const serverName = 'Draftroom'

/** One event on one line: who did it, what they did and at what time of the day. */
export function ActivityEventSummary({ event }: { event: Schema<'ActivityEvent'> }) {
  const intl = useIntl()
  const sentence = useEventSentence()

  return (
    <span className={styles.summary}>
      <Avatar
        decorative
        size="small"
        name={event.actor?.name ?? serverName}
        tone={event.actor === null ? 'neutral' : presenceLookOf(event.actor.id).tone}
      />
      <span className={styles.sentence}>{sentence(event)}</span>
      <time className={styles.time} dateTime={event.createdAt}>
        {intl.formatTime(event.createdAt, { timeStyle: 'short' })}
      </time>
    </span>
  )
}
