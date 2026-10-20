import type { Schema } from '@draftroom/contract'
import { Avatar, Button, Icon, Select } from '@yelison/forma-ui'
import { useId, type Ref } from 'react'
import { useIntl } from 'react-intl'
import { permissionLabelId } from '../../components/Permission/Permission.tsx'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { sameRow, type AccessRow, type RowProblem } from './accessRow.ts'
import { GeneralAccessRow } from './GeneralAccessRow.tsx'
import { documentRoles, isDocumentRole } from './roles.ts'
import styles from './Sharing.module.css'

type AccessEntry = Schema<'AccessEntry'>

export interface AccessListProps {
  entries: readonly AccessEntry[]
  generalAccess: Schema<'GeneralAccess'>
  workspaceName: string
  /** The signed-in person, to say which row is theirs. */
  meId: string | undefined
  /** The row whose change is on its way: the controls are left alone until the server answers. */
  pending: AccessRow | null
  problem: RowProblem | null
  listRef: Ref<HTMLUListElement>
  onRole: (entry: AccessEntry, role: Schema<'DocumentRole'>) => void
  onRemove: (entry: AccessEntry) => void
  onGeneralAccess: (access: Schema<'GeneralAccess'>) => void
}

/**
 * Who has what, in one list: the people with a role and, as its last row, everyone in the workspace. The interface
 * offers what the roles allow and no more: the only explicit owner can be neither lowered nor removed, and says why. The
 * server enforces the same rule and has the last word.
 */
export function AccessList({
  entries,
  generalAccess,
  workspaceName,
  meId,
  pending,
  problem,
  listRef,
  onRole,
  onRemove,
  onGeneralAccess,
}: AccessListProps) {
  const owners = entries.filter((entry) => entry.role === 'owner').length
  const rowProblem = (row: AccessRow) => (problem !== null && sameRow(problem.row, row) ? problem.message : null)

  return (
    <ul ref={listRef} className={styles.principals}>
      {entries.map((entry) => {
        const row: AccessRow = { kind: 'person', userId: entry.userId }
        return (
          <PersonRow
            key={entry.userId}
            entry={entry}
            isMe={entry.userId === meId}
            lastOwner={entry.role === 'owner' && owners === 1}
            busy={pending !== null}
            saving={sameRow(pending, row)}
            problem={rowProblem(row)}
            onRole={onRole}
            onRemove={onRemove}
          />
        )
      })}
      <GeneralAccessRow
        value={generalAccess}
        workspaceName={workspaceName}
        busy={pending !== null}
        saving={sameRow(pending, { kind: 'general' })}
        problem={rowProblem({ kind: 'general' })}
        onChange={onGeneralAccess}
      />
    </ul>
  )
}

interface PersonRowProps {
  entry: AccessEntry
  isMe: boolean
  lastOwner: boolean
  /** A change is on its way, in this row or another. */
  busy: boolean
  saving: boolean
  problem: string | null
  onRole: AccessListProps['onRole']
  onRemove: AccessListProps['onRemove']
}

function PersonRow({ entry, isMe, lastOwner, busy, saving, problem, onRole, onRemove }: PersonRowProps) {
  const intl = useIntl()
  const ids = { reason: useId(), problem: useId() }
  const name = entry.name ?? entry.email
  // The controls of the last owner are dimmed and still reachable, so that the reason they are unavailable can be read.
  const held = busy || lastOwner
  const described = [lastOwner ? ids.reason : null, problem === null ? null : ids.problem].filter(Boolean).join(' ')

  return (
    <li className={styles.row} data-row={entry.userId} aria-busy={saving || undefined}>
      <Avatar name={name} tone={presenceLookOf(entry.userId).tone} decorative />
      <span className={styles.identity}>
        <span className={styles.name}>{isMe ? intl.formatMessage({ id: 'sharing.person.you' }, { name }) : name}</span>
        {entry.name !== null && <span className={styles.caption}>{entry.email}</span>}
      </span>
      <Select
        label={
          <span className="forma-visually-hidden">
            {intl.formatMessage({ id: 'sharing.person.roleLabel' }, { name })}
          </span>
        }
        value={entry.role}
        aria-disabled={held || undefined}
        aria-describedby={described || undefined}
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
        variant="ghost"
        size="compact"
        className={lastOwner ? styles.held : undefined}
        aria-disabled={held || undefined}
        aria-describedby={described || undefined}
        aria-label={intl.formatMessage({ id: 'sharing.person.removeLabel' }, { name })}
        onClick={() => {
          if (!held) onRemove(entry)
        }}
      >
        {intl.formatMessage({ id: 'sharing.person.remove' })}
      </Button>
      {lastOwner && (
        <p id={ids.reason} className={styles.note}>
          <Icon name="lock" size={14} />
          {intl.formatMessage({ id: 'sharing.lastOwner' })}
        </p>
      )}
      {problem !== null && (
        <p id={ids.problem} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
    </li>
  )
}
