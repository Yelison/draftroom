import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { useSessionEnding } from '../documents/QueryFailure.tsx'
import styles from './Home.module.css'

export interface SectionErrorProps {
  title: MessageId
  onRetry: () => void
  retrying: boolean
}

/**
 * What a section says when its data could not be read: one line, announced when it appears, with the way to try again.
 * It takes the room of a line and not of a message block, so the sections around it stay where they are.
 */
export function SectionError({ title, onRetry, retrying }: SectionErrorProps) {
  const intl = useIntl()
  // An ended session fails every read at once and the app is about to send the person to sign in: saying the connection failed would be false.
  if (useSessionEnding()) return null

  return (
    <div role="alert" className={styles.error}>
      <p>{intl.formatMessage({ id: title })}</p>
      <Button variant="secondary" size="compact" loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'documents.error.retry' })}
      </Button>
    </div>
  )
}
