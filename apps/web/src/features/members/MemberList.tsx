import type { Schema } from '@draftroom/contract'
import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { focusMainContent } from '../../app/mainContent.ts'
import { isApiError } from '../../data/errors.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { FormStatus } from '../settings/FormStatus.tsx'
import { InviteMember } from './InviteMember.tsx'
import { countMembers, filterMembers, isKept, type MemberFilter } from './memberFilters.ts'
import { MemberFilters } from './MemberFilters.tsx'
import { MembersTable } from './MembersTable.tsx'
import { RemoveMemberDialog } from './RemoveMemberDialog.tsx'
import { useMemberChanges, type MemberChange } from './useMemberChanges.ts'
import { isLastOwner } from './workspaceRoles.ts'
import styles from './Members.module.css'

/** What a refusal says here in this screen's own words; the rest is what every screen says about a refusal. */
function memberProblemId(error: Error): MessageId | undefined {
  if (isApiError(error, 'last-owner')) return 'members.error.lastOwner'
  if (isApiError(error, 'conflict')) return 'members.error.alreadyMember'
  return undefined
}

export interface MemberListProps {
  workspaceId: string
  members: readonly Schema<'Member'>[]
  meId: string
}

/** The loaded page: the invitation, the filters, the table, and what is said about each change once the server took it. */
export function MemberList({ workspaceId, members, meId }: MemberListProps) {
  const intl = useIntl()
  const [filter, setFilter] = useState<MemberFilter>('all')
  const [removal, setRemoval] = useState<Schema<'Member'> | null>(null)
  const [announcement, setAnnouncement] = useState<{ id: MessageId; values: Record<string, string> } | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const [headlineRequests, setHeadlineRequests] = useState(0)
  const canManage = members.some((member) => member.userId === meId && member.role === 'owner')
  const alone = members.length === 1
  // Alone, there is nothing to filter and the person's own row is the page: a filter chosen before the last invitation left
  // would otherwise leave it without the row.
  const shown = filterMembers(members, alone ? 'all' : filter)

  const changes = useMemberChanges({
    workspaceId,
    onDone: (change: MemberChange) => {
      setFailure(null)
      setAnnouncement({
        id: `members.announce.${change.kind}`,
        values: change.kind === 'removed' ? { name: change.name } : { name: change.name, role: change.role },
      })
      if (change.kind === 'removed') setRemoval(null)
      // The row that had the focus is gone: removed, or no longer one the filter keeps (an owner who is now a member).
      if (change.kind === 'removed' || (change.kind === 'changed' && !isKept(change.member, filter)))
        setHeadlineRequests((requests) => requests + 1)
    },
    onFailed: (error) => {
      setFailure(error)
      setAnnouncement(null)
      setRemoval(null)
    },
  })

  // The control that had the focus is gone with its row, so the focus has nowhere to return to: the headline takes it once
  // the dialog, if there was one, has closed, and never the body.
  useEffect(() => {
    if (headlineRequests > 0) focusMainContent()
  }, [headlineRequests])

  // An owner who steps down, or is demoted by someone else, loses the control that had the focus: the headline takes it and
  // the change is said, never the body.
  const couldManage = useRef(canManage)
  useEffect(() => {
    const lost = couldManage.current && !canManage
    couldManage.current = canManage
    if (!lost) return
    setAnnouncement({ id: 'members.announce.demoted', values: {} })
    focusMainContent()
  }, [canManage])

  return (
    <div className={styles.page}>
      <div className={styles.summary}>
        <p className={styles.description}>
          {intl.formatMessage({ id: canManage ? 'members.description' : 'members.readOnly' })}
        </p>
        {!alone && <p className={styles.count}>{intl.formatMessage({ id: 'members.count' }, countMembers(members))}</p>}
      </div>
      {canManage && <InviteMember busy={changes.busy} failure={failure} onInvite={changes.invite} />}
      {!alone && <MemberFilters value={filter} onChange={setFilter} />}
      {shown.length === 0 ? (
        <StateMessage description={intl.formatMessage({ id: 'members.filter.nobodyPending' })} />
      ) : (
        <MembersTable
          members={shown}
          lastOwnerId={members.find((member) => isLastOwner(members, member))?.userId}
          meId={meId}
          canManage={canManage}
          busy={changes.busy}
          onRole={(target, role) => changes.setRole({ member: target, role })}
          onRemove={setRemoval}
        />
      )}
      {alone && (
        <div className={styles.alone}>
          <StateMessage
            title={intl.formatMessage({ id: 'members.alone.title' })}
            description={intl.formatMessage({ id: 'members.alone.description' })}
          />
        </div>
      )}
      <p role="status" className="forma-visually-hidden">
        {announcement !== null && intl.formatMessage({ id: announcement.id }, announcement.values)}
      </p>
      <FormStatus failure={failure} explain={memberProblemId} />
      <RemoveMemberDialog
        member={removal}
        removing={changes.removing}
        onConfirm={changes.remove}
        onClose={() => {
          if (!changes.removing) setRemoval(null)
        }}
      />
    </div>
  )
}
