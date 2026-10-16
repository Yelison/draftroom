import type { Schema } from '@draftroom/contract'
import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { TemplatesFailure } from './TemplatesFailure.tsx'
import { useTemplates } from './queries.ts'
import styles from './TemplatePickerDialog.module.css'

export interface TemplatePickerDialogProps {
  open: boolean
  onClose: () => void
}

/** The templates to start a document from. Choosing one opens its page, where it can be used. */
export function TemplatePickerDialog({ open, onClose }: TemplatePickerDialogProps) {
  const intl = useIntl()
  const { dialogClose } = useFormaStrings()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={intl.formatMessage({ id: 'templates.picker.title' })}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {dialogClose}
        </Button>
      }
    >
      {open && <TemplateChoices />}
    </Dialog>
  )
}

/** Mounted with the dialog, so the templates are only asked for when someone wants them. */
function TemplateChoices() {
  const intl = useIntl()
  const { query } = useTemplates()

  if (query.isError) return <TemplatesFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />
  if (query.isPending) {
    return (
      <p role="status" className={styles.loading}>
        {intl.formatMessage({ id: 'templates.loading' })}
      </p>
    )
  }
  return <TemplateList templates={query.data.items} />
}

/**
 * The dialog puts the focus on the first thing it can when it opens: while the templates are on their way that is the
 * button that closes it. When they arrive the focus moves to the first one, so the keyboard starts where the choice is.
 */
function TemplateList({ templates }: { templates: readonly Schema<'Template'>[] }) {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const dialog = list.current?.closest('dialog, [role="dialog"]')
    const focused = document.activeElement
    // The focus is on the button that closes the dialog while the templates load, or on the page when the button that
    // asked to try again went away with the failure.
    const stranded = focused === document.body || (dialog?.contains(focused) && !list.current?.contains(focused))
    if (stranded) list.current?.querySelector('a')?.focus()
  }, [])

  return (
    <ul ref={list} className={styles.list}>
      {templates.map((template) => (
        <li key={template.id}>
          <Link to={`/templates/${template.id}`} className={styles.choice}>
            <span className={styles.name}>{template.name}</span>
            <span className={styles.description}>{template.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
