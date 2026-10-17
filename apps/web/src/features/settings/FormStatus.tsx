import { useIntl } from 'react-intl'
import { problemMessageId } from '../documents/problemMessage.ts'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './Settings.module.css'

export interface FormStatusProps {
  /** What the live region says: set once the server has stored the change, and nothing before. */
  saved: MessageId | null
  /** Why the change was not stored; the message is chosen from the refusal's `code`, in the language of the app. */
  failure: Error | null
  /** What a refusal says in this screen's own words instead of the common one (the last owner, a person already in). */
  explain?: (failure: Error) => MessageId | undefined
}

/**
 * What a form says about its last attempt. The region for a saved change exists before anything is saved: one that
 * appears together with its text is not announced. The failure is an alert, which is said as it appears.
 */
export function FormStatus({ saved, failure, explain }: FormStatusProps) {
  const intl = useIntl()

  return (
    <>
      <p role="status" className={styles.saved}>
        {saved !== null && intl.formatMessage({ id: saved })}
      </p>
      {failure !== null && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: explain?.(failure) ?? problemMessageId(failure) })}
        </p>
      )}
    </>
  )
}
