import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import rows from './DocumentRows.module.css'
import styles from './ListSkeleton.module.css'

export interface ListSkeletonProps {
  rows: number
  /** The class of the real list, so the rows lie where the real ones will. */
  listClassName: string | undefined
  /** What the live region says while the list is on its way. */
  label: MessageId
}

/** What a list shows while it is on its way: rows with the measures of the real ones, so nothing moves when it arrives. */
export function ListSkeleton({ rows, listClassName, label }: ListSkeletonProps) {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <ul className={listClassName}>
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className={styles.row} />
        ))}
      </ul>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: label })}
      </p>
    </div>
  )
}

/** The skeleton of a list of documents, with the measures of its rows: the one a folder and the search show. */
export function DocumentsSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <ul className={`${rows.rows} ${rows.panel}`}>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={rows.skeletonRow} />
        ))}
      </ul>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'documents.loading' })}
      </p>
    </div>
  )
}
