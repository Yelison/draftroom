import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { membersQuery } from '../documents/queries.ts'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { meQuery } from '../editor/meQuery.ts'
import { FormStatus } from './FormStatus.tsx'
import { InviteMember } from './InviteMember.tsx'
import { MemberRow } from './MemberRow.tsx'
import { RemoveMemberDialog } from './RemoveMemberDialog.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { SettingsSkeleton } from './SettingsSkeleton.tsx'
import { useMemberChanges, type MemberChange } from './useMemberChanges.ts'
import { isLastOwner } from './workspaceRoles.ts'
import frame from './Settings.module.css'
import styles from './Members.module.css'

/** What a refusal says here in this screen's own words; the rest is what every screen says about a refusal. */
function memberProblemId(error: Error): MessageId | undefined {
  if (isApiError(error, 'last-owner')) return 'settings.members.error.lastOwner'
  if (isApiError(error, 'conflict')) return 'settings.members.error.alreadyMember'
  return undefined
}

/** Who belongs to the workspace and as what: invite by email, change roles, remove. Only owners can change anything. */
export function MembersTab() {
  return <WorkspaceGate loading={<SettingsSkeleton fields={3} />}>{(id) => <Members workspaceId={id} />}</WorkspaceGate>
}

function Members({ workspaceId }: { workspaceId: string }) {
  const dataSource = useDataSource()
  const members = useQuery(membersQuery(dataSource, workspaceId))
  const me = useQuery(meQuery(dataSource))

  if (members.isError || me.isError) {
    return (
      <SettingsFailure
        onRetry={() => {
          void members.refetch()
          void me.refetch()
        }}
        retrying={members.isFetching || me.isFetching}
      />
    )
  }
  if (members.data === undefined || me.data === undefined) return <SettingsSkeleton fields={3} />
  return <MemberList workspaceId={workspaceId} members={members.data.items} meId={me.data.id} />
}

interface MemberListProps {
  workspaceId: string
  members: readonly Schema<'Member'>[]
  meId: string
}

function MemberList({ workspaceId, members, meId }: MemberListProps) {
  const intl = useIntl()
  const [removal, setRemoval] = useState<Schema<'Member'> | null>(null)
  const [announcement, setAnnouncement] = useState<{ id: MessageId; values: Record<string, string> } | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusHeading = useRef(false)
  const canManage = members.some((member) => member.userId === meId && member.role === 'owner')

  const changes = useMemberChanges({
    workspaceId,
    onDone: (change: MemberChange) => {
      setFailure(null)
      setAnnouncement({
        id: `settings.members.announce.${change.kind}`,
        values: change.kind === 'removed' ? { name: change.name } : { name: change.name, role: change.role },
      })
      if (change.kind === 'removed') {
        focusHeading.current = true
        setRemoval(null)
      }
    },
    onFailed: (error) => {
      setFailure(error)
      setAnnouncement(null)
      setRemoval(null)
    },
  })

  // The row that opened the dialog is gone, so the focus has nowhere to return to: the headline takes it once the dialog
  // has closed, and never the body.
  useEffect(() => {
    if (removal !== null || !focusHeading.current) return
    focusHeading.current = false
    heading.current?.focus()
  }, [removal])

  // An owner who steps down, or is demoted by someone else, loses the control that had the focus: the headline takes it and
  // the change is said, never the body.
  const couldManage = useRef(canManage)
  useEffect(() => {
    const lost = couldManage.current && !canManage
    couldManage.current = canManage
    if (!lost) return
    setAnnouncement({ id: 'settings.members.announce.demoted', values: {} })
    heading.current?.focus()
  }, [canManage])

  return (
    <section className={frame.panel} aria-labelledby="settings-members-heading">
      <div>
        <h2 id="settings-members-heading" ref={heading} tabIndex={-1} className={frame.heading}>
          {intl.formatMessage({ id: 'settings.members.title' })}
        </h2>
        <p className={frame.description}>
          {intl.formatMessage({ id: canManage ? 'settings.members.description' : 'settings.members.readOnly' })}
        </p>
      </div>
      {canManage && <InviteMember busy={changes.busy} failure={failure} onInvite={changes.invite} />}
      <ul className={styles.members} aria-label={intl.formatMessage({ id: 'settings.members.list' })}>
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            isMe={member.userId === meId}
            canManage={canManage}
            lastOwner={isLastOwner(members, member)}
            busy={changes.busy}
            onRole={(target, role) => changes.setRole({ member: target, role })}
            onRemove={setRemoval}
          />
        ))}
      </ul>
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
    </section>
  )
}
