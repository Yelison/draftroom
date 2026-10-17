import { Alert, Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { CollabSnapshot } from '../../collab/session.ts'
import styles from './SyncAlerts.module.css'

/** Copying the document into a new one, offered when it is too large to keep editing. */
export interface DuplicateAction {
  run: () => void
  pending: boolean
  /** What went wrong, in the person's language, once the server refused; `null` until then and while it is tried again. */
  problem: string | null
}

export interface SyncAlertsProps {
  snapshot: Pick<CollabSnapshot, 'cause' | 'action' | 'notice'>
  duplicate: DuplicateAction
  onRetry: () => void
  onDiscard: () => void
  onDismissNotice: () => void
}

/**
 * What the person needs to know and may do about their changes: why the connection stopped or could not confirm them, and
 * what they can do (try again; or, for a document too large to keep editing, duplicate it or discard what was not stored and
 * reload), and the notice that what they wrote
 * offline was not kept. They are above the text, where they are seen. They are not live regions of their own: a region
 * that arrives with its text may go unheard, so the editor says the same in one that was already in the page.
 */
export function SyncAlerts({ snapshot, duplicate, onRetry, onDiscard, onDismissNotice }: SyncAlertsProps) {
  const intl = useIntl()
  const { cause, action, notice } = snapshot
  if (cause === null && notice === null) return null

  return (
    <div className={styles.alerts}>
      {cause !== null && (
        <Alert
          tone={cause === 'store-timeout' ? 'amber' : 'red'}
          title={intl.formatMessage({ id: `sync.problem.${cause}.title` })}
        >
          <p className={styles.description}>{intl.formatMessage({ id: `sync.problem.${cause}.description` })}</p>
          {duplicate.problem !== null && <p className={styles.description}>{duplicate.problem}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={action === 'discard-and-reload' ? onDiscard : onRetry}>
              {intl.formatMessage({
                id: action === 'discard-and-reload' ? 'sync.problem.discard' : 'sync.problem.retry',
              })}
            </Button>
            {cause === 'document-too-large' && (
              <Button
                variant="secondary"
                loading={duplicate.pending}
                loadingLabel={intl.formatMessage({ id: 'sync.problem.duplicating' })}
                onClick={duplicate.run}
              >
                {intl.formatMessage({ id: 'sync.problem.duplicate' })}
              </Button>
            )}
          </div>
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
