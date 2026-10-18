import type { Schema } from '@draftroom/contract'
import { Avatar, Button } from '@yelison/forma-ui'
import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { bodyProblem, type BodyProblem } from './bodyProblem.ts'
import { CommentField } from './CommentField.tsx'
import type { Outcome } from './outcome.ts'
import { useAction } from './useAction.ts'
import styles from './CommentItem.module.css'

export interface CommentItemProps {
  comment: Schema<'Comment'>
  /** Whether the person may change the text, which only the author may. */
  mayEdit: boolean
  /** Whether the person may delete it: the author, or an owner of the document. */
  mayDelete: boolean
  /** Whether deleting it takes the whole thread with it, which the confirmation says. */
  isLast: boolean
  onEdit: (body: string) => Promise<Outcome>
  onDelete: () => Promise<Outcome>
}

type Mode = 'view' | 'edit' | 'confirm-delete'

/**
 * One comment: its author, when it was written, its text, and for those who may, editing it and deleting it. Deleting asks
 * first, in place, because it cannot be undone. The focus goes where the person is working: into the field when they
 * edit, onto the safe answer when they are asked, and back to the button that asked when they change their mind.
 */
export function CommentItem({ comment, mayEdit, mayDelete, isLast, onEdit, onDelete }: CommentItemProps) {
  const intl = useIntl()
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(comment.body)
  const [problem, setProblem] = useState<BodyProblem | null>(null)
  const edit = useAction()
  const remove = useAction()
  const editButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const keepAnswer = useRef<HTMLButtonElement>(null)
  // Where the focus goes the next time the comment is shown as text again: the button the person came from.
  const returnTo = useRef<'edit' | 'delete' | null>(null)

  useEffect(() => {
    if (mode === 'edit') field.current?.focus()
    if (mode === 'confirm-delete') keepAnswer.current?.focus()
    if (mode === 'view' && returnTo.current !== null) {
      ;(returnTo.current === 'edit' ? editButton : deleteButton).current?.focus()
      returnTo.current = null
    }
  }, [mode])

  const leave = (from: 'edit' | 'delete') => {
    returnTo.current = from
    edit.clearFailure()
    remove.clearFailure()
    setProblem(null)
    setMode('view')
  }

  async function save() {
    const found = bodyProblem(draft)
    setProblem(found)
    if (found !== null) return
    if (draft.trim() === comment.body) return leave('edit')
    if (await edit.run(() => onEdit(draft.trim()))) leave('edit')
  }

  const name = comment.author.name
  const edited = comment.updatedAt !== comment.createdAt

  return (
    <li className={styles.comment} data-comment-id={comment.id}>
      <div className={styles.header}>
        <Avatar decorative size="small" name={name} tone={presenceLookOf(comment.author.id).tone} />
        <span className={styles.author}>{name}</span>
        <time className={styles.time} dateTime={comment.createdAt}>
          {intl.formatDate(comment.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
        {edited && <span className={styles.edited}>{intl.formatMessage({ id: 'comments.card.edited' })}</span>}
      </div>

      {mode === 'edit' ? (
        <div className={styles.form}>
          <CommentField
            ref={field}
            label={intl.formatMessage({ id: 'comments.card.editLabel' }, { author: name })}
            hideLabel
            value={draft}
            onChange={setDraft}
            onSubmit={() => void save()}
            problem={problem}
            failure={edit.failure}
          />
          <div className={styles.actions}>
            <Button size="compact" loading={edit.pending} onClick={() => void save()}>
              {intl.formatMessage({ id: 'comments.card.save' })}
            </Button>
            <Button size="compact" variant="secondary" onClick={() => leave('edit')}>
              {intl.formatMessage({ id: 'comments.card.cancel' })}
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.body}>{comment.body}</p>
      )}

      {mode === 'confirm-delete' && (
        <div
          className={styles.confirm}
          role="group"
          aria-label={intl.formatMessage({ id: 'comments.card.delete.title' })}
        >
          <p className={styles.question}>
            {intl.formatMessage({ id: isLast ? 'comments.card.delete.lastQuestion' : 'comments.card.delete.question' })}
          </p>
          <div className={styles.actions}>
            <Button size="compact" variant="danger" loading={remove.pending} onClick={() => void remove.run(onDelete)}>
              {intl.formatMessage({ id: 'comments.card.delete.confirm' })}
            </Button>
            <Button ref={keepAnswer} size="compact" variant="secondary" onClick={() => leave('delete')}>
              {intl.formatMessage({ id: 'comments.card.cancel' })}
            </Button>
          </div>
          {remove.failure !== null && (
            <p role="alert" className={styles.failure}>
              {remove.failure}
            </p>
          )}
        </div>
      )}

      {mode === 'view' && (mayEdit || mayDelete) && (
        <div className={styles.actions}>
          {mayEdit && (
            <Button
              ref={editButton}
              size="compact"
              variant="ghost"
              aria-label={intl.formatMessage({ id: 'comments.card.editBy' }, { author: name })}
              onClick={() => {
                setDraft(comment.body)
                setMode('edit')
              }}
            >
              {intl.formatMessage({ id: 'comments.card.edit' })}
            </Button>
          )}
          {mayDelete && (
            <Button
              ref={deleteButton}
              size="compact"
              variant="ghost"
              aria-label={intl.formatMessage({ id: 'comments.card.deleteBy' }, { author: name })}
              onClick={() => setMode('confirm-delete')}
            >
              {intl.formatMessage({ id: 'comments.card.delete' })}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
