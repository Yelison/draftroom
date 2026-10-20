import type { Schema } from '@draftroom/contract'
import { Icon } from '@yelison/forma-ui'
import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './Trash.module.css'

export interface TrashRowProps {
  document: Schema<'Document'>
  /** The name of the folder the document was archived from; `null` when it has none or the folder is gone. */
  folderName: string | null
  selected: boolean
  onSelect: (document: Schema<'Document'>) => void
}

/**
 * An archived document in the list: what it is called and when it was archived, and from where. It is a button that
 * selects it, not a link: an archived document cannot be opened.
 *
 * The selected row is the one the list has in the tab order and the one `aria-current` names; the others are reached
 * with the arrow keys (see `TrashList`).
 */
export function TrashRow({ document, folderName, selected, onSelect }: TrashRowProps) {
  const intl = useIntl()
  // An archived document always has the day it was archived; archiving stamps `updatedAt` with it all the same.
  const archivedAt = document.archivedAt ?? document.updatedAt
  const values = {
    date: intl.formatDate(archivedAt, { dateStyle: 'medium' }),
    folder: folderName,
    time: (date: ReactNode) => <time dateTime={archivedAt}>{date}</time>,
  }

  return (
    <button
      type="button"
      className={styles.row}
      aria-current={selected ? 'true' : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(document)}
    >
      <Icon name="file" className={styles.rowIcon} />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{document.title}</span>
        <span className={styles.rowMeta}>
          {intl.formatMessage({ id: folderName === null ? 'trash.row.metaNoFolder' : 'trash.row.meta' }, values)}
        </span>
      </span>
    </button>
  )
}
