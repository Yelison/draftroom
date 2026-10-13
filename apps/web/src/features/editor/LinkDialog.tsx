import { Button, Dialog, Input, useFormaStrings } from '@yelison/forma-ui'
import { useId, useState, type FormEvent } from 'react'
import { useIntl } from 'react-intl'
import { linkAddressFrom } from './linkAddress.ts'
import styles from './LinkDialog.module.css'

/** A request to open the dialog: `href` is the address of the link the cursor is in, or `null` when it is in none. */
export interface LinkRequest {
  href: string | null
}

export interface LinkDialogProps {
  /** `null` while the dialog is closed. */
  request: LinkRequest | null
  /** Called with the address to store, already checked. */
  onSubmit: (href: string) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * Asks for the address of a link. The address is checked here, before it reaches the editor, so the person is told what
 * is wrong while they are looking at the field. The dialog is Forma UI's, which keeps the focus inside it and gives it
 * back to whatever opened it.
 */
export function LinkDialog({ request, onSubmit, onRemove, onClose }: LinkDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()
  const formId = useId()
  const editing = request?.href != null

  return (
    <Dialog
      open={request !== null}
      onClose={onClose}
      title={intl.formatMessage({ id: editing ? 'editor.link.editTitle' : 'editor.link.addTitle' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {dialogClose}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={onRemove}>
              {intl.formatMessage({ id: 'editor.link.remove' })}
            </Button>
          )}
          <Button type="submit" form={formId}>
            {intl.formatMessage({ id: editing ? 'editor.link.update' : 'editor.link.add' })}
          </Button>
        </>
      }
    >
      {request !== null && <LinkForm id={formId} initialAddress={request.href ?? ''} onSubmit={onSubmit} />}
    </Dialog>
  )
}

interface LinkFormProps {
  id: string
  initialAddress: string
  onSubmit: (href: string) => void
}

/** Rendered only while the dialog is open, so each opening starts from the address of the link and not from the last one. */
function LinkForm({ id, initialAddress, onSubmit }: LinkFormProps) {
  const intl = useIntl()
  const [typed, setTyped] = useState(initialAddress)
  const [invalid, setInvalid] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const address = linkAddressFrom(typed)
    setInvalid(address === null)
    if (address !== null) onSubmit(address)
  }

  return (
    <form id={id} className={styles.form} onSubmit={submit} noValidate>
      <Input
        label={intl.formatMessage({ id: 'editor.link.address' })}
        hint={intl.formatMessage({ id: 'editor.link.hint' })}
        error={invalid ? intl.formatMessage({ id: 'editor.link.invalid' }) : undefined}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value)
          setInvalid(false)
        }}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  )
}
