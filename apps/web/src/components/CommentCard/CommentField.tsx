import { contractLimits } from '@draftroom/contract'
import { Field } from '@yelison/forma-ui'
import type { Ref } from 'react'
import { useIntl } from 'react-intl'
import type { BodyProblem } from './bodyProblem.ts'
import styles from './CommentField.module.css'

export interface CommentFieldProps {
  label: string
  /** The label is the accessible name, and where the field sits already says what it is for. */
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  /** Sends what is written: the field does it with Ctrl or Command and Enter. */
  onSubmit: () => void
  problem: BodyProblem | null
  /** Why the last attempt to send it failed, which is a message of the person's language. */
  failure: string | null
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * The text of a comment: a field that grows with what is written, whose problems are said where the person is typing.
 * The limit is not an HTML `maxlength`, which counts UTF-16 units and would cut an emoji short.
 */
export function CommentField({
  label,
  hideLabel,
  value,
  onChange,
  onSubmit,
  problem,
  failure,
  ref,
}: CommentFieldProps) {
  const intl = useIntl()
  const error =
    problem === null
      ? failure
      : intl.formatMessage({ id: `comments.body.${problem}` }, { max: contractLimits.commentBody.max })

  return (
    <Field label={label} {...(hideLabel === undefined ? {} : { hideLabel })} error={error}>
      {(control) => (
        <textarea
          {...control}
          ref={ref}
          className={styles.field}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              onSubmit()
            }
          }}
        />
      )}
    </Field>
  )
}
