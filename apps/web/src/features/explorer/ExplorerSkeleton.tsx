import { useIntl } from 'react-intl'
import styles from './ExplorerSkeleton.module.css'

const rows = ['recent', 'recent-1', 'recent-2', 'folder', 'folder-1', 'loose', 'loose-1']

/** The explorer while it is on its way: rows of the height of the real ones, so nothing moves when they arrive. */
export function ExplorerSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.skeleton}>
      {rows.map((row) => (
        <div key={row} className={styles.row} />
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'documents.loading' })}
      </p>
    </div>
  )
}
