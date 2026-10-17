import { useIntl } from 'react-intl'
import styles from './Sharing.module.css'

/** What the dialog shows while who has access is on its way: rows with the height of the real ones. */
export function ShareSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.skeletons}>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className={styles.skeleton} />
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'sharing.loading' })}
      </p>
    </div>
  )
}
