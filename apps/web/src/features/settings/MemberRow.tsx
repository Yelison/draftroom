import type { Schema } from '@draftroom/contract'
import { Avatar, Badge, Button, Select } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { displayName, isWorkspaceRole, workspaceRoles } from './workspaceRoles.ts'
import styles from './Members.module.css'

type Member = Schema<'Member'>

export interface MemberRowProps {
  member: Member
  isMe: boolean
  /** Only the owners of the workspace change roles and remove people. */
  canManage: boolean
  /** The only owner: neither lowered nor removed, and the row says why. */
  lastOwner: boolean
  /** A change is on its way: the controls are left alone until the server answers. */
  busy: boolean
  onRole: (member: Member, role: Schema<'WorkspaceRole'>) => void
  onRemove: (member: Member) => void
}

/** A member of the workspace: who they are, whether they are still pending, and what an owner can do with them. */
export function MemberRow({ member, isMe, canManage, lastOwner, busy, onRole, onRemove }: MemberRowProps) {
  const intl = useIntl()
  const reason = useId()
  const name = displayName(member)
  // The controls of the last owner are dimmed and still reachable, so that the reason they are unavailable can be read.
  const held = busy || lastOwner
  const roleName = intl.formatMessage({ id: `settings.members.role.${member.role}` })

  return (
    <li className={styles.member} data-member={member.userId}>
      <Avatar name={name} tone={presenceLookOf(member.userId).tone} decorative />
      <span className={styles.identity}>
        <span className={styles.name}>
          {isMe ? intl.formatMessage({ id: 'settings.members.you' }, { name }) : name}
          {member.status === 'pending' && (
            <Badge tone="amber">{intl.formatMessage({ id: 'settings.members.pending' })}</Badge>
          )}
        </span>
        {member.name !== null && <span className={styles.email}>{member.email}</span>}
        {lastOwner && canManage && (
          <span id={reason} className={styles.email}>
            {intl.formatMessage({ id: 'settings.members.lastOwner' })}
          </span>
        )}
      </span>
      {canManage ? (
        <Select
          label={
            <span className="forma-visually-hidden">
              {intl.formatMessage({ id: 'settings.members.roleLabel' }, { name })}
            </span>
          }
          value={member.role}
          aria-disabled={held || undefined}
          aria-describedby={lastOwner ? reason : undefined}
          onChange={(event) => {
            const role = event.target.value
            if (!held && isWorkspaceRole(role)) onRole(member, role)
          }}
        >
          {workspaceRoles.map((role) => (
            <option key={role} value={role}>
              {intl.formatMessage({ id: `settings.members.role.${role}` })}
            </option>
          ))}
        </Select>
      ) : (
        <span className={styles.role}>{roleName}</span>
      )}
      {canManage && !isMe ? (
        <Button
          variant="secondary"
          aria-disabled={held || undefined}
          aria-label={intl.formatMessage({ id: 'settings.members.removeLabel' }, { name })}
          onClick={() => {
            if (!held) onRemove(member)
          }}
        >
          {intl.formatMessage({ id: 'settings.members.remove' })}
        </Button>
      ) : (
        <span />
      )}
    </li>
  )
}
