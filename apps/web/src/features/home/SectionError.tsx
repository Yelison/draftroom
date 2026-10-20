import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
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

  return (
    <div role="alert" className={styles.error}>
      <p>{intl.formatMessage({ id: title })}</p>
      <Button variant="secondary" size="compact" loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'documents.error.retry' })}
      </Button>
    </div>
  )
}
