import type { Schema } from '@draftroom/contract'
import { Badge, Button } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import { CommentItem } from './CommentItem.tsx'
import type { Outcome } from './outcome.ts'
import { ReplyForm } from './ReplyForm.tsx'
import { useAction } from './useAction.ts'
import styles from './CommentCard.module.css'

/**
 * Where a thread stands: open and on the text, resolved, or orphaned, which is open with nothing left of the text it was
 * about (it keeps its quote, has no highlight, and can still be answered and resolved).
 */
export type CommentCardState = 'open' | 'resolved' | 'orphaned'

export interface CommentCardActions {
  reply: (body: string) => Promise<Outcome>
  resolve: () => Promise<Outcome>
  reopen: () => Promise<Outcome>
  edit: (commentId: string, body: string) => Promise<Outcome>
  remove: (commentId: string) => Promise<Outcome>
}

export interface CommentCardProps {
  thread: Schema<'Thread'>
  state: CommentCardState
  /** Whether this is the thread the person is on, which the text shows with a heavier highlight. */
  active?: boolean
  /** Whether the person may write comments: reply, resolve and reopen. A reader sees the thread and nothing to do. */
  mayComment: boolean
  mayEdit: (comment: Schema<'Comment'>) => boolean
  mayDelete: (comment: Schema<'Comment'>) => boolean
  actions: CommentCardActions
  /** Takes the person to the text the thread is about; left out where there is none to take them to. */
  onShowInText?: () => void
}

/**
 * A comment thread: the text it is about, the conversation and what the person can do with it. The card is one element
 * that can take the focus, which is how a screen puts the person on a thread they asked for.
 */
export function CommentCard({
  thread,
  state,
  active = false,
  mayComment,
  mayEdit,
  mayDelete,
  actions,
  onShowInText,
}: CommentCardProps) {
  const intl = useIntl()
  const noteId = useId()
  const status = useAction()
  const author = thread.comments[0]?.author.name ?? thread.createdBy.name

  return (
    <article
      className={styles.card}
      tabIndex={-1}
      aria-label={intl.formatMessage({ id: 'comments.card.label' }, { author })}
      aria-current={active ? 'true' : undefined}
      aria-describedby={state === 'orphaned' ? noteId : undefined}
      data-thread-id={thread.id}
      data-state={state}
      data-active={active ? '' : undefined}
    >
      {state !== 'open' && (
        <Badge tone={state === 'resolved' ? 'green' : 'amber'} className={styles.badge}>
          {intl.formatMessage({ id: `comments.card.state.${state}` })}
        </Badge>
      )}
      <blockquote className={styles.quote}>{thread.quote}</blockquote>
      {state === 'orphaned' && (
        <p id={noteId} className={styles.note}>
          {intl.formatMessage({ id: 'comments.card.orphaned.note' })}
        </p>
      )}

      <ul className={styles.comments}>
        {thread.comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            mayEdit={mayEdit(comment)}
            mayDelete={mayDelete(comment)}
            isLast={thread.comments.length === 1}
            onEdit={(body) => actions.edit(comment.id, body)}
            onDelete={() => actions.remove(comment.id)}
          />
        ))}
      </ul>

      {mayComment && state !== 'resolved' && <ReplyForm onReply={actions.reply} />}

      {(mayComment || (onShowInText !== undefined && state === 'open')) && (
        <div className={styles.actions}>
          {mayComment && (
            <Button
              size="compact"
              variant="secondary"
              loading={status.pending}
              onClick={() => void status.run(state === 'resolved' ? actions.reopen : actions.resolve)}
            >
              {intl.formatMessage({ id: state === 'resolved' ? 'comments.card.reopen' : 'comments.card.resolve' })}
            </Button>
          )}
          {onShowInText !== undefined && state === 'open' && (
            <Button size="compact" variant="ghost" onClick={onShowInText}>
              {intl.formatMessage({ id: 'comments.card.showInText' })}
            </Button>
          )}
        </div>
      )}
      {status.failure !== null && (
        <p role="alert" className={styles.failure}>
          {status.failure}
        </p>
      )}
    </article>
  )
}
