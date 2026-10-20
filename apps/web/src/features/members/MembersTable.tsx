import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { MemberRow, type MemberRowProps } from './MemberRow.tsx'
import { isLastOwner } from './workspaceRoles.ts'
import styles from './Members.module.css'

type Member = Schema<'Member'>

export interface MembersTableProps extends Pick<MemberRowProps, 'canManage' | 'busy' | 'onRole' | 'onRemove'> {
  /** The members to show, which are some of `everyone`: whether a person is the last owner depends on all of them. */
  members: readonly Member[]
  everyone: readonly Member[]
  meId: string
}

/**
 * The members as a table: a column for each thing a person has, with the header fixed to the top of the window while the
 * rows scroll. There is no table in Forma UI, so this one is the page's own, made of its tokens. A member who cannot
 * change anything has no column of actions at all.
 */
export function MembersTable({ members, everyone, meId, canManage, busy, onRole, onRemove }: MembersTableProps) {
  const intl = useIntl()

  return (
    <div className={styles.panel}>
      <table className={styles.table} aria-label={intl.formatMessage({ id: 'members.list' })}>
        <thead>
          <tr>
            <th scope="col">{intl.formatMessage({ id: 'members.column.member' })}</th>
            <th scope="col" className={styles.roleColumn}>
              {intl.formatMessage({ id: 'members.column.role' })}
            </th>
            <th scope="col" className={styles.statusColumn}>
              {intl.formatMessage({ id: 'members.column.status' })}
            </th>
            <th scope="col" className={styles.since}>
              {intl.formatMessage({ id: 'members.column.since' })}
            </th>
            {canManage && (
              <th scope="col" className={styles.actionsColumn}>
                <span className="forma-visually-hidden">{intl.formatMessage({ id: 'members.column.actions' })}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              isMe={member.userId === meId}
              canManage={canManage}
              lastOwner={isLastOwner(everyone, member)}
              busy={busy}
              onRole={onRole}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
