import type { Schema } from '@draftroom/contract'
import { Avatar, Button, Select } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import { permissionLabelId } from '../../components/Permission/Permission.tsx'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { documentRoles, isDocumentRole } from './roles.ts'
import styles from './Sharing.module.css'

type AccessEntry = Schema<'AccessEntry'>

export interface PeopleListProps {
  entries: readonly AccessEntry[]
  /** The signed-in person, to say which row is theirs. */
  meId: string | undefined
  /** A change is on its way: the controls are left alone until the server answers. */
  busy: boolean
  onRole: (entry: AccessEntry, role: Schema<'DocumentRole'>) => void
  onRemove: (entry: AccessEntry) => void
}

/**
 * The people who have a role in the document. The interface offers what the roles allow and no more: the only explicit
 * owner can be neither lowered nor removed, and says why. The server enforces the same rule and has the last word.
 */
export function PeopleList({ entries, meId, busy, onRole, onRemove }: PeopleListProps) {
  const owners = entries.filter((entry) => entry.role === 'owner').length

  return (
    <ul className={styles.people}>
      {entries.map((entry) => (
        <Person
          key={entry.userId}
          entry={entry}
          isMe={entry.userId === meId}
          lastOwner={entry.role === 'owner' && owners === 1}
          busy={busy}
          onRole={onRole}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}

interface PersonProps {
  entry: AccessEntry
  isMe: boolean
  lastOwner: boolean
  busy: boolean
  onRole: PeopleListProps['onRole']
  onRemove: PeopleListProps['onRemove']
}

function Person({ entry, isMe, lastOwner, busy, onRole, onRemove }: PersonProps) {
  const intl = useIntl()
  const reason = useId()
  const name = entry.name ?? entry.email
  // The controls of the last owner are dimmed and still reachable, so that the reason they are unavailable can be read.
  const held = busy || lastOwner

  return (
    <li className={styles.person} data-person={entry.userId}>
      <Avatar name={name} tone={presenceLookOf(entry.userId).tone} decorative />
      <span className={styles.identity}>
        <span className={styles.name}>{isMe ? intl.formatMessage({ id: 'sharing.person.you' }, { name }) : name}</span>
        {entry.name !== null && <span className={styles.email}>{entry.email}</span>}
        {lastOwner && (
          <span id={reason} className={styles.reason}>
            {intl.formatMessage({ id: 'sharing.lastOwner' })}
          </span>
        )}
      </span>
      <Select
        label={
          <span className="forma-visually-hidden">
            {intl.formatMessage({ id: 'sharing.person.roleLabel' }, { name })}
          </span>
        }
        value={entry.role}
        aria-disabled={held || undefined}
        aria-describedby={lastOwner ? reason : undefined}
        onChange={(event) => {
          const role = event.target.value
          if (!held && isDocumentRole(role)) onRole(entry, role)
        }}
      >
        {documentRoles.map((role) => (
          <option key={role} value={role}>
            {intl.formatMessage({ id: permissionLabelId(role) })}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        aria-disabled={held || undefined}
        aria-describedby={lastOwner ? reason : undefined}
        aria-label={intl.formatMessage({ id: 'sharing.person.removeLabel' }, { name })}
        onClick={() => {
          if (!held) onRemove(entry)
        }}
      >
        {intl.formatMessage({ id: 'sharing.person.remove' })}
      </Button>
    </li>
  )
}
