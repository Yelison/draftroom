import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import { Field } from '@yelison/forma-ui'
import type { KeyboardEvent } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { useGrowingField } from './useGrowingField.ts'
import { useTitleSave, type TitleProblem } from './useTitleSave.ts'
import styles from './TitleField.module.css'

export interface TitleFieldProps {
  document: Schema<'Document'>
  /** Whether the role may rename the document. A reader sees the title and cannot change it. */
  editable: boolean
  /** Called after Enter, once the title has been handed over for saving: the screen moves on to the text. */
  onEnter: () => void
}

const problemMessage: Record<TitleProblem, MessageId> = {
  required: 'editor.title.required',
  tooLong: 'editor.title.tooLong',
  conflict: 'editor.title.conflict',
  failed: 'editor.title.failed',
}

/**
 * The title of the document, above its text. It is the document's metadata and is saved on its own. A title that does not fit in
 * a line wraps, since it is the heading of the document and must be read whole; it is still one line of text, with no line
 * breaks in it.
 */
export function TitleField({ document, editable, onEnter }: TitleFieldProps) {
  const intl = useIntl()
  const { value, problem, change, commit } = useTitleSave(document)
  const field = useGrowingField(value)

  function enter(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter that picks a composed character (an IME) is not the person asking to leave the field.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (commit()) onEnter()
  }

  return (
    <div className={styles.field}>
      <Field
        label={intl.formatMessage({ id: 'editor.title.label' })}
        hideLabel
        error={
          problem === null
            ? undefined
            : intl.formatMessage({ id: problemMessage[problem] }, { max: contractLimits.documentTitle.max })
        }
      >
        {(control) => (
          <textarea
            {...control}
            ref={field}
            rows={1}
            readOnly={!editable}
            // A line break pasted into the title is a space: the title is a line of text that wraps, not paragraphs. The field
            // shows what the title is, which is also what the limit allows: it is not controlled (`useGrowingField`).
            onChange={(event) => {
              const shown = change(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))
              if (shown !== event.target.value) event.target.value = shown
            }}
            onBlur={() => void commit()}
            onKeyDown={enter}
            autoComplete="off"
            spellCheck={false}
            className={styles.title}
          />
        )}
      </Field>
    </div>
  )
}
