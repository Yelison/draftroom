import type { Schema } from '@draftroom/contract'
import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { displayName } from './workspaceRoles.ts'

export interface RemoveMemberDialogProps {
  /** Who is about to be removed; the dialog is closed while there is nobody. */
  member: Schema<'Member'> | null
  removing: boolean
  onConfirm: (member: Schema<'Member'>) => void
  onClose: () => void
}

/**
 * Asks before somebody leaves the workspace: it cannot be undone from here, and what they lose is said. The way out is
 * first, so it is the one that has the focus.
 */
export function RemoveMemberDialog({ member, removing, onConfirm, onClose }: RemoveMemberDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const name = member === null ? '' : displayName(member)

  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={intl.formatMessage({ id: 'settings.members.remove.title' }, { name })}
      description={intl.formatMessage({ id: 'settings.members.remove.description' }, { name })}
      footer={
        <>
          <Button variant="secondary" disabled={removing} onClick={onClose}>
            {dialogClose}
          </Button>
          <Button
            loading={removing}
            onClick={() => {
              if (member !== null) onConfirm(member)
            }}
          >
            {intl.formatMessage({ id: 'settings.members.remove.confirm' })}
          </Button>
        </>
      }
    />
  )
}
