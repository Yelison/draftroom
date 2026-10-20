import type { Schema } from '@draftroom/contract'
import { Avatar, Icon } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'
import styles from './Shared.module.css'

/**
 * A shared document. The title is the one link of the row and covers all of it, so the whole row opens the document and
 * the Tab key stops once for each.
 */
export function SharedRow({ document }: { document: Schema<'Document'> }) {
  const intl = useIntl()

  return (
    <li className={styles.row}>
      <Icon name="file" className={styles.rowIcon} />
      <span className={styles.rowText}>
        <DocumentRowLink to={`/documents/${document.id}`} className={styles.rowTitle}>
          {document.title}
        </DocumentRowLink>
        <span className={styles.rowExcerpt}>
          {document.excerpt ?? <span className={styles.noText}>{intl.formatMessage({ id: 'shared.row.noText' })}</span>}
        </span>
      </span>
      <span className={`${styles.rowCell} ${styles.rowCreatedBy}`}>
        <span className={styles.rowCellLabel}>{intl.formatMessage({ id: 'shared.row.createdBy' })}</span>
        <span className={styles.person}>
          <Avatar
            decorative
            size="small"
            name={document.createdBy.name}
            tone={presenceLookOf(document.createdBy.id).tone}
          />
          <span className={styles.personName}>{document.createdBy.name}</span>
        </span>
      </span>
      <span className={`${styles.rowCell} ${styles.rowUpdated}`}>
        <span className={styles.rowCellLabel}>{intl.formatMessage({ id: 'shared.row.updated' })}</span>
        <time dateTime={document.updatedAt} className={styles.date}>
          {intl.formatDate(document.updatedAt, { dateStyle: 'medium' })}
        </time>
      </span>
      <Icon name="chevron" className={styles.rowGo} />
    </li>
  )
}
