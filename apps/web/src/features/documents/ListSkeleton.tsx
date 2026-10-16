import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import layout from './ListLayout.module.css'
import styles from './ListSkeleton.module.css'

export interface ListSkeletonProps {
  rows?: number
  /** The class of the real list, so the rows lie where the real ones will. The grid of the documents unless said. */
  listClassName?: string | undefined
  /** What the live region says while the list is on its way. */
  label?: MessageId
}

/**
 * What a list shows while it is on its way: rows with the measures of the real ones, so nothing moves when it arrives.
 * The documents are what it draws unless a screen says otherwise, as the Trash does with its own column.
 */
export function ListSkeleton({
  rows = 6,
  listClassName = layout.grid,
  label = 'documents.loading',
}: ListSkeletonProps) {
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
