import type { Schema } from '@draftroom/contract'
import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { problemMessageId } from '../documents/problemMessage.ts'
import dialog from '../documents/actions/Dialog.module.css'
import { isGone } from './gone.ts'
import { useDeleteDocument } from './useDeleteDocument.ts'

export interface DeleteDocumentDialogProps {
  /** The document to delete; `null` while the dialog is closed. */
  document: Schema<'Document'> | null
  onClose: () => void
  /** Called once the server has deleted it. */
  onDeleted: (document: Schema<'Document'>) => void
  /** Called when it was already gone, restored or deleted by someone else, so the screen can say so. */
  onGone: (document: Schema<'Document'>) => void
}

/**
 * Asks before a document is deleted for good, naming it and saying that it cannot be undone. The safe answer is first,
 * so it is the one that has the focus.
 */
export function DeleteDocumentDialog({ document, onClose, onDeleted, onGone }: DeleteDocumentDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const deletion = useDeleteDocument()

  // Whoever has confirmed waits for the answer: a dialog that went away would leave them not knowing what happened.
  const close = () => {
    if (deletion.isPending) return
    deletion.reset()
    onClose()
  }

  const confirm = () => {
    if (document === null) return
    deletion.mutate(document, {
      onSuccess: () => {
        deletion.reset()
        onDeleted(document)
      },
      onError: (error) => {
        if (!isGone(error)) return
        deletion.reset()
        onGone(document)
      },
    })
  }

  return (
    <Dialog
      open={document !== null}
      onClose={close}
      title={intl.formatMessage({ id: 'trash.delete.title' }, { title: document?.title ?? '' })}
      description={intl.formatMessage({ id: 'trash.delete.description' })}
      footer={
        <>
          <Button variant="secondary" disabled={deletion.isPending} onClick={close}>
            {dialogClose}
          </Button>
          <Button variant="danger" loading={deletion.isPending} onClick={confirm}>
            {intl.formatMessage({ id: 'trash.delete.action' })}
          </Button>
        </>
      }
    >
      {deletion.error !== null && (
        <p role="alert" className={dialog.problem}>
          {intl.formatMessage({ id: problemMessageId(deletion.error) })}
        </p>
      )}
    </Dialog>
  )
}
