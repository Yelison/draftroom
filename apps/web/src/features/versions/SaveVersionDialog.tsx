import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import { Button, Dialog, Input, useFormaStrings } from '@yelison/forma-ui'
import { useId, useState, type FormEvent } from 'react'
import { useIntl } from 'react-intl'
import { problemMessageId } from '../documents/problemMessage.ts'
import dialog from '../documents/actions/Dialog.module.css'
import { useSaveVersion } from './useSaveVersion.ts'

export interface SaveVersionDialogProps {
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/** Saves the document as it is now, under a name the person may give it. The dialog is Forma UI's: the focus returns to the button. */
export function SaveVersionDialog({ document, open, onClose, onSaved }: SaveVersionDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const formId = useId()
  const saving = useSaveVersion(document)
  const [label, setLabel] = useState('')

  const close = () => {
    if (saving.isPending) return
    saving.reset()
    setLabel('')
    onClose()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    saving.mutate(label.trim(), {
      onSuccess: () => {
        saving.reset()
        setLabel('')
        onSaved()
      },
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={intl.formatMessage({ id: 'versions.save.title' })}
      description={intl.formatMessage({ id: 'versions.save.description' })}
      footer={
        <>
          <Button variant="secondary" disabled={saving.isPending} onClick={close}>
            {dialogClose}
          </Button>
          <Button type="submit" form={formId} loading={saving.isPending}>
            {intl.formatMessage({ id: 'versions.save.action' })}
          </Button>
        </>
      }
    >
      <form id={formId} className={dialog.form} onSubmit={submit}>
        <Input
          label={intl.formatMessage({ id: 'versions.save.label' })}
          hint={intl.formatMessage({ id: 'versions.save.hint' })}
          maxLength={contractLimits.versionLabel.max}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        {saving.isError && (
          <p role="alert" className={dialog.problem}>
            {intl.formatMessage({ id: problemMessageId(saving.error) })}
          </p>
        )}
      </form>
    </Dialog>
  )
}
