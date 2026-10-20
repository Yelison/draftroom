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
 * the link is the title and the rest (the role, what it says, where it is, when it changed) is its description.
 */
export function RecentCard({ document, folderName }: RecentCardProps) {
  const intl = useIntl()
  const id = useId()
  const roleId = `${id}-role`
  const excerptId = `${id}-excerpt`
  const footId = `${id}-foot`
  const badge = document.role !== 'owner'

  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <Icon name="file" className={styles.cardIcon} />
        {/* Owning it is the usual case and says nothing: the badge is for the documents that are somebody else's. */}
        {badge && (
          <span id={roleId}>
            <Permission role={document.role} />
          </span>
        )}
      </div>
      <h3 className={styles.cardTitle}>
        <Link
          to={`/documents/${document.id}`}
          className={styles.cardLink}
          aria-describedby={`${badge ? `${roleId} ` : ''}${excerptId} ${footId}`}
        >
          {document.title}
        </Link>
      </h3>
      <p id={excerptId} className={document.excerpt === null ? styles.cardNoExcerpt : styles.cardExcerpt}>
        {document.excerpt ?? intl.formatMessage({ id: 'home.recent.noExcerpt' })}
      </p>
      <p id={footId} className={styles.cardFoot}>
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
