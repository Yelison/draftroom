import { Alert, Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { CollabSnapshot } from '../../collab/session.ts'
import styles from './SyncAlerts.module.css'

export interface SyncAlertsProps {
  snapshot: CollabSnapshot
  onRetry: () => void
  onDiscard: () => void
  onDismissNotice: () => void
}

/**
 * What the person needs to know and may do about their changes: why the connection stopped or could not confirm them, and
 * the one thing they can do (try again, or discard what was not stored and reload), and the notice that what they wrote
 * offline was not kept. They are above the text, where they are seen, and they are announced when they appear.
 */
export function SyncAlerts({ snapshot, onRetry, onDiscard, onDismissNotice }: SyncAlertsProps) {
  const intl = useIntl()
  const { cause, action, notice } = snapshot
  if (cause === null && notice === null) return null

  return (
    <div className={styles.alerts}>
      {cause !== null && (
        <Alert
          tone={cause === 'store-timeout' || cause === 'unavailable' ? 'amber' : 'red'}
          live
          title={intl.formatMessage({ id: `sync.problem.${cause}.title` })}
        >
          <p className={styles.description}>{intl.formatMessage({ id: `sync.problem.${cause}.description` })}</p>
          <Button variant="secondary" onClick={action === 'discard-and-reload' ? onDiscard : onRetry}>
            {intl.formatMessage({
              id: action === 'discard-and-reload' ? 'sync.problem.discard' : 'sync.problem.retry',
            })}
          </Button>
        </Alert>
      )}
      {notice !== null && (
        <Alert tone="blue" live title={intl.formatMessage({ id: 'sync.notice.offlineChangesDiscarded.title' })}>
          <p className={styles.description}>
            {intl.formatMessage({ id: 'sync.notice.offlineChangesDiscarded.description' })}
          </p>
          <Button variant="secondary" onClick={onDismissNotice}>
            {intl.formatMessage({ id: 'sync.notice.dismiss' })}
          </Button>
        </Alert>
      )}
    </div>
  )
}
