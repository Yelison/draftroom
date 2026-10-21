import type { Schema } from '@draftroom/contract'
import { Avatar, Badge } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../../collab/presenceColor.ts'
import type { CommentCardState } from '../../../components/CommentCard/CommentCard.tsx'
import styles from './CompactThread.module.css'

export interface CompactThreadProps {
  thread: Schema<'Thread'>
  state: CommentCardState
  /** Makes it the active thread, which is the whole card. */
  onActivate: () => void
}

/**
 * A thread in the margin that the person is not on: the text it is about, who started it and when, two lines of what was
 * said and how many replies it has. It is one button, so that choosing it, with the pointer or the keyboard, is what makes
 * it the active thread. It says what a card says in less room and has nothing to do in it.
 */
export function CompactThread({ thread, state, onActivate }: CompactThreadProps) {
  const intl = useIntl()
  const first = thread.comments[0]
  const author = first?.author ?? thread.createdBy
  const replies = Math.max(0, thread.comments.length - 1)

  return (
    <button type="button" className={styles.compact} data-thread-id={thread.id} data-state={state} onClick={onActivate}>
      {state !== 'open' && (
        <Badge tone={state === 'resolved' ? 'green' : 'amber'} className={styles.badge}>
          {intl.formatMessage({ id: `comments.card.state.${state}` })}
        </Badge>
      )}
      <span className={styles.quote}>{thread.quote}</span>
      <span className={styles.who}>
        <Avatar decorative size="small" name={author.name} tone={presenceLookOf(author.id).tone} />
        <span className={styles.author}>{author.name}</span>
        <time className={styles.time} dateTime={first?.createdAt ?? thread.createdAt}>
          {intl.formatDate(first?.createdAt ?? thread.createdAt, { month: 'short', day: 'numeric' })}
        </time>
      </span>
      <span className={styles.body}>{first?.body}</span>
      {replies > 0 && (
        <span className={styles.replies}>
          {intl.formatMessage({ id: 'comments.compact.replies' }, { count: replies })}
        </span>
      )}
    </button>
  )
}
