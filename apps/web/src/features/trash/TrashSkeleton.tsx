import { useIntl } from 'react-intl'
import styles from './Trash.module.css'

/** What the trash shows while it is on its way: the list and the panel with the measures of the real ones, so nothing moves when they arrive. */
export function TrashSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.trash}>
      <div className={styles.layout}>
        <ul className={styles.list}>
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className={styles.item} />
          ))}
        </ul>
        <div className={`${styles.panel} ${styles.panelSkeleton}`} />
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'trash.loading' })}
      </p>
    </div>
  )
}
