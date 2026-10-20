import type { Schema } from '@draftroom/contract'
import { Icon } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { Permission } from '../../components/Permission/Permission.tsx'
import styles from './Home.module.css'

export interface RecentCardProps {
  document: Schema<'Document'>
  /** The name of the folder it is in; `null` for a document that is in none. */
  folderName: string | null
}

/**
 * A document to pick up, as a card that is one link: the title is the link and stretches over the card, so the name of
 * the link is the title and the rest (what it says, where it is, when it changed) is its description.
 */
export function RecentCard({ document, folderName }: RecentCardProps) {
  const intl = useIntl()
  const detailsId = useId()

  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <Icon name="file" className={styles.cardIcon} />
        {/* Owning it is the usual case and says nothing: the badge is for the documents that are somebody else's. */}
        {document.role !== 'owner' && <Permission role={document.role} />}
      </div>
      <h3 className={styles.cardTitle}>
        <Link to={`/documents/${document.id}`} className={styles.cardLink} aria-describedby={detailsId}>
          {document.title}
        </Link>
      </h3>
      <p id={detailsId} className={document.excerpt === null ? styles.cardNoExcerpt : styles.cardExcerpt}>
        {document.excerpt ?? intl.formatMessage({ id: 'home.recent.noExcerpt' })}
      </p>
      <p className={styles.cardFoot}>
        <span>{folderName ?? intl.formatMessage({ id: 'documents.details.noFolder' })}</span>
        <span>
          {intl.formatMessage(
            { id: 'documents.row.updated' },
            {
              date: (
                <time dateTime={document.updatedAt}>
                  {intl.formatDate(document.updatedAt, { dateStyle: 'medium' })}
                </time>
              ),
            },
          )}
        </span>
      </p>
    </li>
  )
}
