import { useIntl } from 'react-intl'
import styles from './Shared.module.css'

/** What the list shows while it is on its way: the rows of the table, with their height, so nothing moves when it arrives. */
export function SharedSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className={styles.skeletonRow} />
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'shared.loading' })}
      </p>
    </div>
  )
}
