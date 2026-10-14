import type { Schema } from '@draftroom/contract'
import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { problemMessageId } from '../problemMessage.ts'
import { useArchiveDocument } from './useArchiveDocument.ts'
import styles from './Dialog.module.css'

export interface ArchiveDocumentDialogProps {
  /** The document to archive; `null` while the dialog is closed. */
  document: Schema<'Document'> | null
  onClose: () => void
  /** Called once the server has archived it, with the document, so the screen can say so. */
  onArchived: (document: Schema<'Document'>) => void
}

/** Asks before a document leaves the lists. The safe answer is first, so it is the one that has the focus. */
export function ArchiveDocumentDialog({ document, onClose, onArchived }: ArchiveDocumentDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const archive = useArchiveDocument()

  const close = () => {
    archive.reset()
    onClose()
  }

  return (
    <Dialog
      open={document !== null}
      onClose={close}
      title={intl.formatMessage({ id: 'documents.archive.title' }, { title: document?.title ?? '' })}
      description={intl.formatMessage({ id: 'documents.archive.description' })}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {dialogClose}
          </Button>
          <Button
            variant="danger"
            loading={archive.isPending}
            onClick={() => {
              if (document === null) return
              archive.mutate(document, {
                onSuccess: (archived) => {
                  archive.reset()
                  onArchived(archived)
                },
              })
            }}
          >
            {intl.formatMessage({ id: 'documents.archive.action' })}
          </Button>
        </>
      }
    >
      {archive.error !== null && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(archive.error) })}
        </p>
      )}
    </Dialog>
  )
}
