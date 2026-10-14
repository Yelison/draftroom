import { contractLimits, type Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button, Dialog, Input, Select, useFormaStrings } from '@yelison/forma-ui'
import { useId, useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../../data/useDataSource.ts'
import { problemMessageId } from '../problemMessage.ts'
import { foldersQuery } from '../queries.ts'
import { revisionFromConflict } from './conflict.ts'
import { textProblem } from './textProblem.ts'
import { useUpdateDocument } from './useUpdateDocument.ts'
import styles from './Dialog.module.css'

export interface DocumentDetailsDialogProps {
  /** The document to rename or move; `null` while the dialog is closed. */
  document: Schema<'Document'> | null
  onClose: () => void
  /** Hands over to the confirmation of archiving, which only an owner is offered. */
  onArchive: (document: Schema<'Document'>) => void
}

const noFolder = ''

/** Rename a document and move it to a folder in one go: they are one operation of the contract, on one revision. */
export function DocumentDetailsDialog({ document, onClose, onArchive }: DocumentDetailsDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const formId = useId()
  const update = useUpdateDocument()

  const close = () => {
    update.reset()
    onClose()
  }

  return (
    <Dialog
      open={document !== null}
      onClose={close}
      title={intl.formatMessage({ id: 'documents.details.title' })}
      footer={
        <>
          {document?.role === 'owner' && (
            <Button variant="ghost" className={styles.leading} onClick={() => onArchive(document)}>
              {intl.formatMessage({ id: 'documents.archive.action' })}
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            {dialogClose}
          </Button>
          <Button type="submit" form={formId} loading={update.isPending}>
            {intl.formatMessage({ id: 'documents.details.save' })}
          </Button>
        </>
      }
    >
      {document !== null && (
        <DetailsForm
          id={formId}
          document={document}
          failure={update.error}
          onSubmit={(change) => {
            // Nothing to say to the server when nothing changed.
            if (Object.keys(change).length === 0) return close()
            const revision = revisionFromConflict(update.error) ?? document.revision
            update.mutate({ document, revision, ...change }, { onSuccess: close })
          }}
        />
      )}
    </Dialog>
  )
}

interface DetailsFormProps {
  id: string
  document: Schema<'Document'>
  failure: Error | null
  onSubmit: (change: { title?: string; folderId?: string | null }) => void
}

/** The fields. They are mounted only while the dialog is open, so each opening starts from the document as it is. */
function DetailsForm({ id, document, failure, onSubmit }: DetailsFormProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const folders = useQuery(foldersQuery(dataSource, document.workspaceId))
  const [title, setTitle] = useState(document.title)
  const [folderId, setFolderId] = useState(document.folderId ?? noFolder)
  const [problem, setProblem] = useState<ReturnType<typeof textProblem>>(null)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = textProblem(title, contractLimits.documentTitle)
    setProblem(found)
    if (found !== null) return
    const trimmed = title.trim()
    const targetFolder = folderId === noFolder ? null : folderId
    onSubmit({
      ...(trimmed === document.title ? {} : { title: trimmed }),
      ...(targetFolder === document.folderId ? {} : { folderId: targetFolder }),
    })
  }

  return (
    <form id={id} onSubmit={submit} noValidate className={styles.form}>
      <Input
        label={intl.formatMessage({ id: 'documents.details.titleLabel' })}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={
          problem === null
            ? undefined
            : intl.formatMessage({ id: `documents.title.${problem}` }, { max: contractLimits.documentTitle.max })
        }
      />
      <Select
        label={intl.formatMessage({ id: 'documents.details.folderLabel' })}
        value={folderId}
        onChange={(event) => setFolderId(event.target.value)}
      >
        <option value={noFolder}>{intl.formatMessage({ id: 'documents.details.noFolder' })}</option>
        {folders.data?.items.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </Select>
      {failure !== null && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(failure) })}
        </p>
      )}
    </form>
  )
}
