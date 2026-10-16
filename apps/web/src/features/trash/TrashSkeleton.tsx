import { useIntl } from 'react-intl'
import styles from './Trash.module.css'

const rows = 4

/** What the trash shows while it is on its way: rows with the measures of the real ones, so nothing moves when it arrives. */
export function TrashSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <ul className={styles.list}>
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className={styles.skeletonRow} />
        ))}
      </ul>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'trash.loading' })}
      </p>
    </div>
  )
}
