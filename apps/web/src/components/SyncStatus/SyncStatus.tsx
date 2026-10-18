import type { SyncState } from '@draftroom/contract/collab'
import { Badge, type BadgeTone } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './SyncStatus.module.css'

/** What the pill can say: a state, or `offline-tab`, which is offline with nothing kept on the device. */
type Label = SyncState | 'offline-tab'

const tones: Record<Label, BadgeTone> = {
  connecting: 'neutral',
  synchronising: 'blue',
  synced: 'green',
  'offline-local': 'amber',
  'offline-tab': 'amber',
  reconnecting: 'amber',
  error: 'red',
  revoked: 'red',
  'read-only': 'neutral',
}

// Every state the label can take, so the pill is always as wide as the longest of them in the language that is showing:
// the label changes with the state and nothing beside it moves.
const labels = Object.keys(tones) as Label[]

const labelOf = (label: Label): MessageId => `sync.state.${label}`

/** The word the announcement chooses a label by: a selector of ICU cannot hold a hyphen. */
const selectorOf: Record<Label, string> = {
  connecting: 'connecting',
  synchronising: 'synchronising',
  synced: 'synced',
  'offline-local': 'offlineLocal',
  'offline-tab': 'offlineTab',
  reconnecting: 'reconnecting',
  error: 'error',
  revoked: 'revoked',
  'read-only': 'readOnly',
}

/** Offline where the device keeps no copy says so: "with local copy" would tell the person what is not true. */
const labelFor = (state: SyncState, keepsCopy: boolean): Label =>
  state === 'offline-local' && !keepsCopy ? 'offline-tab' : state

/**
 * Where what the person wrote is: only on this device, on its way, or stored by the server. "Synced" is said only for the
 * last (a local copy is never "saved"). The state is announced once, when it changes, in a region that was already in the
 * page; typing changes nothing here, because the state does not change with every key. Offline, it also says whether the
 * device keeps a copy, so the pill and the notice over the sheet never tell the person two different things.
 */
export function SyncStatus({ state, keepsCopy }: { state: SyncState; keepsCopy: boolean }) {
  const intl = useIntl()
  const shown = labelFor(state, keepsCopy)

  return (
    <Badge tone={tones[shown]} shape="pill" className={styles.status}>
      {/* Seen, not heard: the region below says it. All the labels are laid out in one cell so the width never changes. */}
      <span className={styles.labels} aria-hidden="true">
        {labels.map((candidate) => (
          <span key={candidate} className={candidate === shown ? styles.current : styles.other}>
            {intl.formatMessage({ id: labelOf(candidate) })}
          </span>
        ))}
      </span>
      <span role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'sync.announcement' }, { status: selectorOf[shown] })}
      </span>
    </Badge>
  )
}
