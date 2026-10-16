import type { Schema } from '@draftroom/contract'
import { buttonClassName, IconButton } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { Permission } from '../../components/Permission/Permission.tsx'
import styles from './Shared.module.css'

export interface SharedPreviewProps {
  document: Schema<'Document'>
  onClose: () => void
}

/**
 * What the list already knows about a document: its start, who made it, when it changed and what the person can do
 * with it. The text of the document is on the collaboration connection, which only the editor opens.
 */
export function SharedPreview({ document, onClose }: SharedPreviewProps) {
  const intl = useIntl()

  return (
    <aside
      aria-label={intl.formatMessage({ id: 'shared.preview.label' }, { title: document.title })}
      className={styles.preview}
    >
      <div className={styles.previewHeader}>
        <h2 className={styles.previewTitle}>{document.title}</h2>
        <IconButton icon="close" label={intl.formatMessage({ id: 'shared.preview.close' })} onClick={onClose} />
      </div>
      <div className={styles.previewRole}>
        <Permission role={document.role} />
      </div>
      <p className={styles.previewExcerpt}>{document.excerpt ?? intl.formatMessage({ id: 'shared.preview.empty' })}</p>
      <p className={styles.previewMeta}>
        {intl.formatMessage({ id: 'shared.preview.createdBy' }, { name: document.createdBy.name })}
      </p>
      <p className={styles.previewMeta}>
        {intl.formatMessage(
          { id: 'shared.preview.updated' },
          { date: intl.formatDate(document.updatedAt, { dateStyle: 'medium' }) },
        )}
      </p>
      <Link to={`/documents/${document.id}`} className={buttonClassName()}>
        {intl.formatMessage({ id: 'shared.preview.open' })}
      </Link>
    </aside>
  )
}
