import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useSessionEnding } from '../QueryFailure.tsx'
import styles from './Sections.module.css'

export interface SectionFailureProps {
  name: string
  onRetry: () => void
  retrying: boolean
}

/** What a section says when its documents could not be read: it says so on its own line, so the other sections stay. */
export function SectionFailure({ name, onRetry, retrying }: SectionFailureProps) {
  const intl = useIntl()
  if (useSessionEnding()) return null

  return (
    <div role="alert" className={styles.footer}>
      <p className={`${styles.line} ${styles.problem}`}>{intl.formatMessage({ id: 'documents.section.error' })}</p>
      <Button
        variant="secondary"
        loading={retrying}
        aria-label={intl.formatMessage({ id: 'documents.section.retryIn' }, { name })}
        onClick={onRetry}
      >
        {intl.formatMessage({ id: 'documents.section.retry' })}
      </Button>
    </div>
  )
}
