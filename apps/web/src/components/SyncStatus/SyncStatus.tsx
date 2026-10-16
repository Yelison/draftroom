import type { SyncState } from '@draftroom/contract/collab'
import { Badge, type BadgeTone } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './SyncStatus.module.css'

const tones: Record<SyncState, BadgeTone> = {
  connecting: 'neutral',
  synchronising: 'blue',
  synced: 'green',
  'offline-local': 'amber',
  reconnecting: 'amber',
  error: 'red',
  revoked: 'red',
  'read-only': 'neutral',
}

// Every state the label can take, so the pill is always as wide as the longest of them in the language that is showing:
// the label changes with the state and nothing beside it moves.
const states = Object.keys(tones) as SyncState[]

const labelOf = (state: SyncState): MessageId => `sync.state.${state}`

/**
 * Where what the person wrote is: only on this device, on its way, or stored by the server. "Synced" is said only for the
 * last (a local copy is never "saved"). The state is announced once, when it changes, in a region that was already in the
 * page; typing changes nothing here, because the state does not change with every key.
 */
export function SyncStatus({ state }: { state: SyncState }) {
  const intl = useIntl()

  return (
    <Badge tone={tones[state]} shape="pill" className={styles.status}>
      {/* Seen, not heard: the region below says it. All the labels are laid out in one cell so the width never changes. */}
      <span className={styles.labels} aria-hidden="true">
        {states.map((candidate) => (
          <span key={candidate} className={candidate === state ? styles.current : styles.other}>
            {intl.formatMessage({ id: labelOf(candidate) })}
          </span>
        ))}
      </span>
      <span role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'sync.announcement' }, { status: intl.formatMessage({ id: labelOf(state) }) })}
      </span>
    </Badge>
  )
}
