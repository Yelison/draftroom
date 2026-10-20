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

/** A member of the workspace: who they are, their role and state, since when, and what an owner can do with them. */
export function MemberRow({ member, isMe, canManage, lastOwner, busy, onRole, onRemove }: MemberRowProps) {
  const intl = useIntl()
  const reason = useId()
  const name = displayName(member)
  // The controls of the last owner are dimmed and still reachable, so that the reason they are unavailable can be read.
  const held = busy || lastOwner
  const pending = member.status === 'pending'
  const since = intl.formatDate(member.createdAt, { dateStyle: 'medium' })

  return (
    <tr data-member={member.userId}>
      <td>
        <div className={styles.who}>
          <span className={styles.avatar}>
            <Avatar name={name} tone={presenceLookOf(member.userId).tone} decorative />
          </span>
          <span className={styles.identity}>
            <span className={styles.name}>{isMe ? intl.formatMessage({ id: 'members.you' }, { name }) : name}</span>
            {member.name !== null && <span className={styles.email}>{member.email}</span>}
          </span>
        </div>
      </td>
      <td>
        {canManage ? (
          <div className={styles.role}>
            <Select
              label={
                <span className="forma-visually-hidden">
                  {intl.formatMessage({ id: 'members.roleLabel' }, { name })}
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
                  {intl.formatMessage({ id: `members.role.${role}` })}
                </option>
              ))}
            </Select>
            {lastOwner && (
              <span id={reason} className={styles.email}>
                {intl.formatMessage({ id: 'members.lastOwner' })}
              </span>
            )}
          </div>
        ) : (
          <Badge tone={member.role === 'owner' ? 'purple' : 'neutral'} shape="pill">
            {intl.formatMessage({ id: `members.role.${member.role}` })}
          </Badge>
        )}
      </td>
      <td>
        <Badge tone={pending ? 'amber' : 'green'} shape="pill">
          {intl.formatMessage({ id: pending ? 'members.status.pending' : 'members.status.active' })}
        </Badge>
      </td>
      <td className={styles.since}>
        <time dateTime={member.createdAt}>
          {pending ? intl.formatMessage({ id: 'members.since.invited' }, { date: since }) : since}
        </time>
      </td>
      {canManage && (
        <td className={styles.actions}>
          {!isMe && (
            <Button
              variant="secondary"
              size="compact"
              aria-disabled={held || undefined}
              aria-label={intl.formatMessage({ id: 'members.removeLabel' }, { name })}
              onClick={() => {
                if (!held) onRemove(member)
              }}
            >
              {intl.formatMessage({ id: 'members.remove' })}
            </Button>
          )}
        </td>
      )}
    </tr>
  )
}
