import { Alert, Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { CollabSnapshot } from '../../collab/session.ts'
import styles from './SyncAlerts.module.css'

export interface SyncAlertsProps {
  snapshot: Pick<CollabSnapshot, 'state' | 'editable' | 'cause' | 'action' | 'notice'>
  onRetry: () => void
  onDiscard: () => void
  onDismissNotice: () => void
}

/**
 * What the person needs to know and may do about their changes: why the connection stopped or could not confirm them, and
 * the one thing they can do (try again, or discard what was not stored and reload); that what they wrote offline was not
 * kept; and that what they write while offline is only on this device. They are above the text, where they are seen. They
 * are not live regions of their own: a region that arrives with its text may go unheard, so the editor says the same in
 * one that was already in the page, and the sync status announces going offline.
 */
export function SyncAlerts({ snapshot, onRetry, onDiscard, onDismissNotice }: SyncAlertsProps) {
  const intl = useIntl()
  const { state, editable, cause, action, notice } = snapshot
  // A reader who is offline has nothing of their own on the device to be told about.
  const keptOnDevice = state === 'offline-local' && editable
  if (cause === null && notice === null && !keptOnDevice) return null

  return (
    <div className={styles.alerts}>
      {keptOnDevice && (
        <Alert tone="amber" title={intl.formatMessage({ id: 'sync.notice.offlineLocal.title' })}>
          <p className={styles.description}>{intl.formatMessage({ id: 'sync.notice.offlineLocal.description' })}</p>
        </Alert>
      )}
      {cause !== null && (
        <Alert
          tone={cause === 'store-timeout' ? 'amber' : 'red'}
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
        <Alert tone="blue" title={intl.formatMessage({ id: 'sync.notice.offlineChangesDiscarded.title' })}>
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
