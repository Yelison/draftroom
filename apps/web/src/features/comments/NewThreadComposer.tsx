import type { Schema } from '@draftroom/contract'
import { Button } from '@yelison/forma-ui'
import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { bodyProblem, type BodyProblem } from '../../components/CommentCard/bodyProblem.ts'
import { CommentField } from '../../components/CommentCard/CommentField.tsx'
import type { Outcome } from '../../components/CommentCard/outcome.ts'
import { useAction } from '../../components/CommentCard/useAction.ts'
import styles from './NewThreadComposer.module.css'

/** A comment being written on a selection: where it will be anchored, the text it quotes and what is written so far. */
export interface Draft {
  anchor: Schema<'Anchor'>
  quote: string
  body: string
}

export interface NewThreadComposerProps {
  draft: Draft
  /** Changes when the person asks again for a comment while the form is open, which puts the focus in the field again. */
  focusRequest: number
  onChange: (body: string) => void
  /** Sends the thread; the draft is kept for as long as it does not work. */
  onSubmit: (draft: Draft) => Promise<Outcome>
  onCancel: () => void
}

/**
 * The form of a new thread, on top of the list. It takes the focus when it opens and each time the person asks for a
 * comment again, because they have just asked for it, and Escape closes it and gives the focus back to the text. The anchor was made when the person asked, so what they
 * type in the document meanwhile does not move it.
 */
export function NewThreadComposer({ draft, focusRequest, onChange, onSubmit, onCancel }: NewThreadComposerProps) {
  const intl = useIntl()
  const send = useAction()
  const [problem, setProblem] = useState<BodyProblem | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => field.current?.focus(), [focusRequest])

  async function submit() {
    const found = bodyProblem(draft.body)
    setProblem(found)
    if (found === null) await send.run(() => onSubmit({ ...draft, body: draft.body.trim() }))
  }

  return (
    <section
      className={styles.composer}
      aria-label={intl.formatMessage({ id: 'comments.new.title' })}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onCancel()
      }}
    >
      <blockquote className={styles.quote}>{draft.quote}</blockquote>
      <CommentField
        ref={field}
        label={intl.formatMessage({ id: 'comments.new.label' })}
        value={draft.body}
        onChange={(body) => {
          onChange(body)
          setProblem(null)
        }}
        onSubmit={() => void submit()}
        problem={problem}
        failure={send.failure}
      />
      <div className={styles.actions}>
        <Button size="compact" loading={send.pending} onClick={() => void submit()}>
          {intl.formatMessage({ id: 'comments.new.submit' })}
        </Button>
        <Button size="compact" variant="secondary" onClick={onCancel}>
          {intl.formatMessage({ id: 'comments.card.cancel' })}
        </Button>
      </div>
    </section>
  )
}
