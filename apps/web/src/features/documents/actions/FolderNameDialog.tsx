import { contractLimits, type Schema } from '@draftroom/contract'
import { Button, Dialog, Input, useFormaStrings } from '@yelison/forma-ui'
import { useId, useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { problemMessageId } from '../problemMessage.ts'
import { revisionFromConflict } from './conflict.ts'
import { textProblem, type TextProblem } from './textProblem.ts'
import { useCreateFolder } from './useCreateFolder.ts'
import { useUpdateFolder } from './useUpdateFolder.ts'
import styles from './Dialog.module.css'

/** What the dialog is for: a new folder, or the name of one that exists. */
export type FolderNameTarget = { kind: 'create'; workspaceId: string } | { kind: 'rename'; folder: Schema<'Folder'> }

export interface FolderNameDialogProps {
  target: FolderNameTarget | null
  onClose: () => void
}

/** Names a folder: a new one, or an existing one with the revision it was last read at. Any member can do both. */
export function FolderNameDialog({ target, onClose }: FolderNameDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const formId = useId()
  const create = useCreateFolder(target?.kind === 'create' ? target.workspaceId : '')
  const rename = useUpdateFolder()
  const mutation = target?.kind === 'rename' ? rename : create

  const close = () => {
    create.reset()
    rename.reset()
    onClose()
  }

  function save(name: string) {
    if (target === null) return
    if (target.kind === 'create') return create.mutate(name, { onSuccess: close })
    if (name === target.folder.name) return close()
    const revision = revisionFromConflict(rename.error) ?? target.folder.revision
    rename.mutate({ folder: target.folder, revision, name }, { onSuccess: close })
  }

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={intl.formatMessage({
        id: target?.kind === 'rename' ? 'documents.folder.renameTitle' : 'documents.folder.createTitle',
      })}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {dialogClose}
          </Button>
          <Button type="submit" form={formId} loading={mutation.isPending}>
            {intl.formatMessage({
              id: target?.kind === 'rename' ? 'documents.folder.save' : 'documents.folder.create',
            })}
          </Button>
        </>
      }
    >
      {target !== null && (
        <NameForm
          id={formId}
          initialName={target.kind === 'rename' ? target.folder.name : ''}
          failure={mutation.error}
          onSubmit={save}
        />
      )}
    </Dialog>
  )
}

interface NameFormProps {
  id: string
  initialName: string
  failure: Error | null
  onSubmit: (name: string) => void
}

/** The field, mounted only while the dialog is open, so each opening starts from the name the folder has. */
function NameForm({ id, initialName, failure, onSubmit }: NameFormProps) {
  const intl = useIntl()
  const [name, setName] = useState(initialName)
  const [problem, setProblem] = useState<TextProblem | null>(null)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = textProblem(name, contractLimits.folderName)
    setProblem(found)
    if (found === null) onSubmit(name.trim())
  }

  return (
    <form id={id} onSubmit={submit} noValidate className={styles.form}>
      <Input
        label={intl.formatMessage({ id: 'documents.folder.nameLabel' })}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={
          problem === null
            ? undefined
            : intl.formatMessage({ id: `documents.folderName.${problem}` }, { max: contractLimits.folderName.max })
        }
      />
      {failure !== null && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(failure) })}
        </p>
      )}
    </form>
  )
}
