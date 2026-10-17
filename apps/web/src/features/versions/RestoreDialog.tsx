import type { Schema } from '@draftroom/contract'
import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import dialog from '../documents/actions/Dialog.module.css'
import { restoreProblemId } from './restoreProblem.ts'
import { useRestoreVersion } from './useRestoreVersion.ts'
import { useVersionName } from './useVersionName.ts'

export interface RestoreDialogProps {
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>
  /** The version to go back to; `null` while the dialog is closed. */
  version: Schema<'Version'> | null
  onClose: () => void
  /** Called once the server has restored it. */
  onRestored: (version: Schema<'Version'>) => void
}

/**
 * Asks before the document goes back to an earlier version, and says what that means for the people in it. Cancel comes
 * first, so it has the focus: going back changes the text for everybody. The dialog is Forma UI's, which gives the focus
 * back to the button that opened it.
 */
export function RestoreDialog({ document, version, onClose, onRestored }: RestoreDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const nameOf = useVersionName()
  const restoration = useRestoreVersion(document)

  // Whoever has confirmed waits for the answer: a dialog that went away would leave them not knowing what happened.
  const close = () => {
    if (restoration.isPending) return
    restoration.reset()
    onClose()
  }

  const confirm = () => {
    if (version === null) return
    restoration.mutate(version, {
      onSuccess: () => {
        restoration.reset()
        onRestored(version)
      },
    })
  }

  return (
    <Dialog
      open={version !== null}
      onClose={close}
      title={intl.formatMessage({ id: 'versions.restore.title' }, { name: version === null ? '' : nameOf(version) })}
      description={intl.formatMessage({ id: 'versions.restore.description' })}
      footer={
        <>
          <Button variant="secondary" disabled={restoration.isPending} onClick={close}>
            {dialogClose}
          </Button>
          <Button loading={restoration.isPending} onClick={confirm}>
            {intl.formatMessage({ id: 'versions.restore.action' })}
          </Button>
        </>
      }
    >
      <p role="status" className="forma-visually-hidden">
        {restoration.isPending && intl.formatMessage({ id: 'versions.restore.progress' })}
      </p>
      {restoration.isError && (
        <p role="alert" className={dialog.problem}>
          {intl.formatMessage({ id: restoreProblemId(restoration.error) })}
        </p>
      )}
    </Dialog>
  )
}
