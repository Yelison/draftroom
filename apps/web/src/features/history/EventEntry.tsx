import { Badge } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { ActorAvatar } from './ActorAvatar.tsx'
import { DocumentLink } from './DocumentLink.tsx'
import { isAccessEvent, type ActivityEvent } from './activityEvents.ts'
import { useRichEventSentence } from './useEventSentence.tsx'
import styles from './Timeline.module.css'

/** One event of the timeline: who did it and what they did, with the label that tells a change of access apart. */
export function EventEntry({ event }: { event: ActivityEvent }) {
  const intl = useIntl()
  const sentence = useRichEventSentence()

  return (
    <>
      <ActorAvatar actor={event.actor} />
      <span className={styles.text}>
        <span>
          {sentence(event, (document) => (
            <DocumentLink document={document} />
          ))}
        </span>
        {isAccessEvent(event) && <Badge tone="amber">{intl.formatMessage({ id: 'history.access.label' })}</Badge>}
      </span>
    </>
  )
}
