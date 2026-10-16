import type { Schema } from '@draftroom/contract'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../components/DocumentRow/DocumentRow.tsx'
import styles from './Trash.module.css'

export interface TrashRowProps {
  document: Schema<'Document'>
  restoring: boolean
  onRestore: (document: Schema<'Document'>) => void
  onDelete: (document: Schema<'Document'>) => void
}

/** An archived document: when it was archived, and the two things an owner can do with it. It is not a link: it cannot be opened. */
export function TrashRow({ document, restoring, onRestore, onDelete }: TrashRowProps) {
  const intl = useIntl()

  return (
    <DocumentRow
      card
      variant="archived"
      title={document.title}
      meta={
        document.archivedAt === null
          ? undefined
          : intl.formatMessage(
              { id: 'trash.row.archived' },
              { date: intl.formatDate(document.archivedAt, { dateStyle: 'medium' }) },
            )
      }
      trailing={
        <span className={styles.actions}>
          <Button
            size="compact"
            variant="secondary"
            loading={restoring}
            aria-label={intl.formatMessage({ id: 'trash.row.restoreLabel' }, { title: document.title })}
            onClick={() => onRestore(document)}
          >
            {intl.formatMessage({ id: 'trash.row.restore' })}
          </Button>
          <Button
            size="compact"
            variant="secondary"
            aria-label={intl.formatMessage({ id: 'trash.row.deleteLabel' }, { title: document.title })}
            onClick={() => onDelete(document)}
          >
            {intl.formatMessage({ id: 'trash.row.delete' })}
          </Button>
        </span>
      }
    />
  )
}
