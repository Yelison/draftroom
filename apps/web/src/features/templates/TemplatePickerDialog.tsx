import { Dialog, useFormaStrings, Button } from '@yelison/forma-ui'
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
  return (
    <ul className={styles.list}>
      {query.data.items.map((template) => (
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
