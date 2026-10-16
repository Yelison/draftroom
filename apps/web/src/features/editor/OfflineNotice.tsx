import { useIntl } from 'react-intl'
import type { CollabSnapshot } from '../../collab/session.ts'
import styles from './OfflineNotice.module.css'

/**
 * Where what the person writes without a connection is: on this device, or only in this tab when the device keeps no copy
 * and closing the tab would lose it. It is one short line laid over the top of the sheet, where the sheet has room, so that
 * the text never moves when the connection goes and comes back. It is not a live region: the sync status announces the
 * change of state, and a region that arrives with its text may go unheard.
 *
 * A reader has nothing of their own to lose, so they are told nothing.
 */
export function OfflineNotice({ snapshot }: { snapshot: Pick<CollabSnapshot, 'state' | 'editable' | 'keepsCopy'> }) {
  const intl = useIntl()
  if (snapshot.state !== 'offline-local' || !snapshot.editable) return null

  return (
    <p className={styles.notice}>
      {intl.formatMessage({ id: snapshot.keepsCopy ? 'sync.offline.local' : 'sync.offline.tabOnly' })}
    </p>
  )
}
