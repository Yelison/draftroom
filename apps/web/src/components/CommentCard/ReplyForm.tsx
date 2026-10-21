import { Button } from '@yelison/forma-ui'
import { useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { bodyProblem, type BodyProblem } from './bodyProblem.ts'
import { CommentField } from './CommentField.tsx'
import type { Outcome } from './outcome.ts'
import { useAction } from './useAction.ts'
import styles from './CommentCard.module.css'

/**
 * The answer to a thread: a line that opens when the person comes to it, with the button that sends it once there is something to
 * send. What is written stays in the field when the server refuses it, and the focus stays in the field when it is accepted,
 * so the person can go on without finding their place again.
 */
export function ReplyForm({ onReply }: { onReply: (body: string) => Promise<Outcome> }) {
  const intl = useIntl()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<BodyProblem | null>(null)
  const reply = useAction()
  const field = useRef<HTMLTextAreaElement>(null)

  async function send() {
    const found = bodyProblem(draft)
    setProblem(found)
    if (found !== null) return
    if (await reply.run(() => onReply(draft.trim()))) {
      setDraft('')
      field.current?.focus()
    }
  }

  return (
    <div className={styles.reply}>
      <CommentField
        ref={field}
        label={intl.formatMessage({ id: 'comments.card.replyLabel' })}
        hideLabel
        value={draft}
        onChange={(value) => {
          setDraft(value)
          setProblem(null)
        }}
        onSubmit={() => void send()}
        problem={problem}
        failure={reply.failure}
        placeholder={intl.formatMessage({ id: 'comments.card.replyPlaceholder' })}
      />
      {/* Only when there is something to send: a reply that is not written is a line, and the button is not asked for. */}
      {draft.trim() !== '' && (
        <Button size="compact" loading={reply.pending} onClick={() => void send()}>
          {intl.formatMessage({ id: 'comments.card.reply' })}
        </Button>
      )}
    </div>
  )
}
